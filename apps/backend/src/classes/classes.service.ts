import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { EnrollmentStatus, EnrollmentType } from '../generated/prisma/enums';
import { toSeoulDateString, todaySeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';
import { ClassQueryDto } from './dto/class-query.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

export type DerivedClassStatus = 'UPCOMING' | 'OPERATING' | 'ENDED';

export type ClassResponse = {
  id: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  derivedStatus: DerivedClassStatus;
  archived: boolean;
  programs: Array<{
    id: string;
    courseOfferingId: string;
    name: string;
    archived: boolean;
    instructor: { id: string; name: string; loginId: string | null };
    subjects: Array<{
      id: string;
      courseOfferingSubjectId: string;
      subjectId: string;
      name: string;
      active: boolean;
    }>;
  }>;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClassPageResponse = {
  items: ClassResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const CLASS_INCLUDE = {
  programs: {
    include: {
      courseOffering: {
        include: {
          instructor: { select: { id: true, name: true, loginId: true } },
        },
      },
      classSubjects: {
        include: {
          courseOfferingSubject: { include: { subject: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: {
    select: {
      enrollments: {
        where: {
          type: EnrollmentType.REGULAR,
          status: {
            in: [
              EnrollmentStatus.SCHEDULED,
              EnrollmentStatus.ACTIVE,
            ] as EnrollmentStatus[],
          },
        },
      },
    },
  },
} as const;

type ClassWithRelations = Prisma.ClassGetPayload<{
  include: typeof CLASS_INCLUDE;
}>;

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ClassQueryDto): Promise<ClassPageResponse> {
    const keyword = query.keyword?.trim();
    const where: Prisma.ClassWhereInput = {
      archivedAt: query.archived ? { not: null } : null,
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const items = await tx.class.findMany({
        where,
        include: CLASS_INCLUDE,
        orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
        skip,
        take: query.limit,
      });
      const total = await tx.class.count({ where });
      return [items, total] as const;
    });

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(classId: string): Promise<ClassResponse> {
    const item = await this.prisma.class.findUnique({
      where: { id: classId },
      include: CLASS_INCLUDE,
    });
    if (!item) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
    return this.toResponse(item);
  }

  async create(
    dto: CreateClassDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    const startDate = this.toDate(dto.startDate);
    const endDate = this.toDate(dto.endDate);
    this.assertDateOrder(startDate, endDate);

    const classId = await this.prisma.$transaction(async (tx) => {
      const programs = await tx.courseOffering.findMany({
        where: { id: { in: dto.programIds }, archivedAt: null },
        include: { subjects: true },
      });
      if (programs.length !== dto.programIds.length) {
        throw new NotFoundException(
          '선택한 교육과정 중 사용할 수 없는 교육과정이 있습니다.',
        );
      }

      const created = await tx.class.create({
        data: {
          name: dto.name.trim(),
          room: dto.room?.trim() || null,
          startDate,
          endDate,
          capacity: dto.capacity,
          createdById: actor.id,
        },
      });

      for (const programId of dto.programIds) {
        const program = programs.find((item) => item.id === programId);
        if (!program) continue;
        const classProgram = await tx.classProgram.create({
          data: { classId: created.id, courseOfferingId: program.id },
        });
        await tx.classSubject.createMany({
          data: program.subjects.map((subject) => ({
            classId: created.id,
            courseOfferingId: program.id,
            courseOfferingSubjectId: subject.id,
            classProgramId: classProgram.id,
            active: true,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_CREATED',
          resourceType: 'CLASS',
          resourceId: created.id,
          afterData: {
            name: created.name,
            startDate: dto.startDate,
            endDate: dto.endDate,
            programIds: dto.programIds,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
      return created.id;
    });

    return this.findOne(classId);
  }

  async update(
    classId: string,
    dto: UpdateClassDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.class.findUnique({
        where: { id: classId },
        include: { programs: true },
      });
      if (!existing) {
        throw new NotFoundException('반을 찾을 수 없습니다.');
      }
      if (existing.archivedAt) {
        throw new ConflictException('보관된 반은 수정할 수 없습니다.');
      }

      const phase = this.deriveStatus(existing.startDate, existing.endDate);
      const coreChange =
        dto.room !== undefined ||
        dto.startDate !== undefined ||
        dto.endDate !== undefined ||
        dto.capacity !== undefined;
      if (phase === 'ENDED') {
        throw new ConflictException('운영이 종료된 반은 수정할 수 없습니다.');
      }
      if (phase === 'OPERATING' && coreChange) {
        throw new ConflictException(
          '운영 중인 반은 반 이름만 수정할 수 있습니다.',
        );
      }

      const startDate = dto.startDate
        ? this.toDate(dto.startDate)
        : existing.startDate;
      const endDate = dto.endDate ? this.toDate(dto.endDate) : existing.endDate;
      this.assertDateOrder(startDate, endDate);

      const updated = await tx.class.update({
        where: { id: classId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.room !== undefined ? { room: dto.room.trim() || null } : {}),
          startDate,
          endDate,
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        },
      });

      // 수강 기간은 반 운영 기간을 그대로 따른다.
      // 반 기간이 바뀌면 수강 중인 학생 전원에게 반영한다.
      // 철회한 학생은 철회일을 유지해야 하므로 건드리지 않는다.
      const periodChanged =
        startDate.getTime() !== existing.startDate.getTime() ||
        endDate.getTime() !== existing.endDate.getTime();

      if (periodChanged) {
        await tx.enrollment.updateMany({
          where: {
            classId,
            type: EnrollmentType.REGULAR,
            status: EnrollmentStatus.ACTIVE,
          },
          data: { startsOn: startDate, endsOn: endDate },
        });

        await tx.enrollmentSubject.updateMany({
          where: {
            enrollment: {
              classId,
              type: EnrollmentType.REGULAR,
              status: EnrollmentStatus.ACTIVE,
            },
          },
          data: { startsOn: startDate, endsOn: endDate },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_UPDATED',
          resourceType: 'CLASS',
          resourceId: classId,
          afterData: {
            name: updated.name,
            startDate: this.toDateString(updated.startDate),
            endDate: this.toDateString(updated.endDate),
            programIds: existing.programs.map(
              (program) => program.courseOfferingId,
            ),
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId);
  }

  async remove(
    classId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<void> {
    const item = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!item) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }

    const upcoming =
      this.deriveStatus(item.startDate, item.endDate) === 'UPCOMING';
    const operationalCount = await this.prisma.classSession.count({
      where: { classId },
    });

    await this.prisma.$transaction(async (tx) => {
      let removedEnrollmentCount = 0;

      if (upcoming && operationalCount === 0) {
        const enrollmentIds = (
          await tx.enrollment.findMany({
            where: { classId },
            select: { id: true },
          })
        ).map((enrollment) => enrollment.id);

        if (enrollmentIds.length > 0) {
          await tx.enrollmentSubject.deleteMany({
            where: { enrollmentId: { in: enrollmentIds } },
          });
          removedEnrollmentCount = (
            await tx.enrollment.deleteMany({
              where: { id: { in: enrollmentIds } },
            })
          ).count;
        }

        await tx.class.delete({ where: { id: classId } });
      } else {
        await tx.class.update({
          where: { id: classId },
          data: { archivedAt: new Date() },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action:
            upcoming && operationalCount === 0
              ? 'CLASS_DELETED'
              : 'CLASS_ARCHIVED',
          resourceType: 'CLASS',
          resourceId: classId,
          afterData: { removedEnrollmentCount },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });
  }

  async changeSubjectActive(
    classId: string,
    classSubjectId: string,
    active: boolean,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    const classItem = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classItem) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
    if (
      this.deriveStatus(classItem.startDate, classItem.endDate) !== 'UPCOMING'
    ) {
      throw new ConflictException(
        '운영 과목은 반 운영 시작 전까지만 변경할 수 있습니다.',
      );
    }

    const subject = await this.prisma.classSubject.findFirst({
      where: { id: classSubjectId, classId },
    });
    if (!subject) {
      throw new NotFoundException('반 운영 과목을 찾을 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.classSubject.update({
        where: { id: subject.id },
        data: { active },
      });
      const disabledScheduleCount = active
        ? 0
        : (
            await tx.classSchedulePattern.updateMany({
              where: { classId, classSubjectId: subject.id, active: true },
              data: { active: false },
            })
          ).count;
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SUBJECT_ACTIVE_CHANGED',
          resourceType: 'CLASS_SUBJECT',
          resourceId: subject.id,
          beforeData: { active: subject.active },
          afterData: { active, disabledScheduleCount },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId);
  }

  private toResponse(item: ClassWithRelations): ClassResponse {
    return {
      id: item.id,
      name: item.name,
      room: item.room,
      startDate: this.toDateString(item.startDate),
      endDate: this.toDateString(item.endDate),
      capacity: item.capacity,
      derivedStatus: this.deriveStatus(item.startDate, item.endDate),
      archived: item.archivedAt !== null,
      programs: item.programs.map((program) => ({
        id: program.id,
        courseOfferingId: program.courseOfferingId,
        name: program.courseOffering.name,
        archived: program.courseOffering.archivedAt !== null,
        instructor: program.courseOffering.instructor,
        subjects: program.classSubjects.map((subject) => ({
          id: subject.id,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          subjectId: subject.courseOfferingSubject.subject.id,
          name: subject.courseOfferingSubject.subject.name,
          active: subject.active,
        })),
      })),
      enrollmentCount: item._count.enrollments,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private deriveStatus(startDate: Date, endDate: Date): DerivedClassStatus {
    const today = todaySeoulDateString();
    if (today < this.toDateString(startDate)) return 'UPCOMING';
    if (today > this.toDateString(endDate)) return 'ENDED';
    return 'OPERATING';
  }

  private assertDateOrder(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new BadRequestException('반 종료일은 시작일보다 빠를 수 없습니다.');
    }
  }

  private toDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private toDateString(value: Date): string {
    return toSeoulDateString(value);
  }
}
