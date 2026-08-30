import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  CourseStatus,
  EnrollmentStatus,
  EnrollmentType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeClassStatusDto } from './dto/change-class-status.dto';
import { ClassQueryDto } from './dto/class-query.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

export type ClassResponse = {
  id: string;
  courseOfferingId: string;
  name: string;
  description: string | null;
  room: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: ClassStatus;
  subjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    subjectId: string;
    subjectName: string;
    sequence: number;
  }>;
  currentInstructor: {
    id: string;
    name: string;
    loginId: string | null;
  } | null;
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
  classSubjects: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: true,
        },
      },
    },
    orderBy: {
      courseOfferingSubject: {
        sequence: 'asc' as const,
      },
    },
  },
  instructorAssignments: {
    where: {
      assignedTo: null,
    },
    include: {
      instructor: {
        select: {
          id: true,
          name: true,
          loginId: true,
        },
      },
    },
    take: 1,
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

type ClassWithRelations = {
  id: string;
  courseOfferingId: string;
  name: string;
  description: string | null;
  room: string | null;
  startDate: Date;
  endDate: Date;
  capacity: number;
  status: ClassStatus;
  createdAt: Date;
  updatedAt: Date;
  classSubjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    courseOfferingSubject: {
      sequence: number;
      subject: {
        id: string;
        name: string;
      };
    };
  }>;
  instructorAssignments: Array<{
    instructor: {
      id: string;
      name: string;
      loginId: string | null;
    };
  }>;
  _count: {
    enrollments: number;
  };
};

@Injectable()
export class ClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    query: ClassQueryDto,
  ): Promise<ClassPageResponse> {
    await this.assertCourseOfferingExists(courseOfferingId);

    const where = {
      courseOfferingId,
      ...(query.status ? { status: query.status } : {}),
    };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        include: CLASS_INCLUDE,
        orderBy: [{ startDate: 'asc' }, { name: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.class.count({ where }),
    ]);

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

  async findOne(
    courseOfferingId: string,
    classId: string,
  ): Promise<ClassResponse> {
    const classItem = await this.prisma.class.findFirst({
      where: {
        id: classId,
        courseOfferingId,
      },
      include: CLASS_INCLUDE,
    });

    if (!classItem) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }

    return this.toResponse(classItem);
  }

  async create(
    courseOfferingId: string,
    dto: CreateClassDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    const name = dto.name.trim();
    const startDate = this.toDate(dto.startDate);
    const endDate = this.toDate(dto.endDate);

    if (!name) {
      throw new BadRequestException('반명을 입력해야 합니다.');
    }
    this.assertDateOrder(startDate, endDate);

    try {
      const classId = await this.prisma.$transaction(async (tx) => {
        const courseOffering = await tx.courseOffering.findUnique({
          where: { id: courseOfferingId },
          include: {
            subjects: {
              select: { id: true },
            },
          },
        });

        if (!courseOffering) {
          throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
        }
        if (
          courseOffering.status === CourseStatus.COMPLETED ||
          courseOffering.status === CourseStatus.CANCELED
        ) {
          throw new ConflictException(
            '완료되거나 취소된 개설 강의에는 반을 만들 수 없습니다.',
          );
        }
        this.assertWithinCoursePeriod(
          startDate,
          endDate,
          courseOffering.startDate,
          courseOffering.endDate,
        );
        if (courseOffering.subjects.length === 0) {
          throw new ConflictException(
            '과목이 연결되지 않은 개설 강의에는 반을 만들 수 없습니다.',
          );
        }

        const created = await tx.class.create({
          data: {
            courseOfferingId,
            name,
            description: this.optionalText(dto.description),
            room: this.optionalText(dto.room),
            startDate,
            endDate,
            capacity: dto.capacity,
            status: ClassStatus.PLANNED,
            createdById: actor.id,
          },
        });

        await tx.classSubject.createMany({
          data: courseOffering.subjects.map((subject) => ({
            classId: created.id,
            courseOfferingId,
            courseOfferingSubjectId: subject.id,
          })),
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'CLASS_CREATED',
            resourceType: 'CLASS',
            resourceId: created.id,
            afterData: {
              courseOfferingId,
              name,
              startDate: dto.startDate,
              endDate: dto.endDate,
              capacity: dto.capacity,
              copiedSubjectCount: courseOffering.subjects.length,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created.id;
      });

      return this.findOne(courseOfferingId, classId);
    } catch (error: unknown) {
      this.throwIfDuplicate(error);
      throw error;
    }
  }

  async update(
    courseOfferingId: string,
    classId: string,
    dto: UpdateClassDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.class.findFirst({
          where: { id: classId, courseOfferingId },
          include: { courseOffering: true },
        });

        if (!current) {
          throw new NotFoundException('반을 찾을 수 없습니다.');
        }
        if (current.status !== ClassStatus.PLANNED) {
          throw new ConflictException('예정 상태의 반만 수정할 수 있습니다.');
        }

        const startDate = dto.startDate
          ? this.toDate(dto.startDate)
          : current.startDate;
        const endDate = dto.endDate
          ? this.toDate(dto.endDate)
          : current.endDate;
        this.assertDateOrder(startDate, endDate);
        this.assertWithinCoursePeriod(
          startDate,
          endDate,
          current.courseOffering.startDate,
          current.courseOffering.endDate,
        );

        const name = dto.name === undefined ? current.name : dto.name.trim();
        if (!name) {
          throw new BadRequestException('반명을 입력해야 합니다.');
        }

        await tx.class.update({
          where: { id: classId },
          data: {
            name,
            description:
              dto.description === undefined
                ? current.description
                : this.optionalText(dto.description),
            room:
              dto.room === undefined
                ? current.room
                : this.optionalText(dto.room),
            startDate,
            endDate,
            capacity: dto.capacity ?? current.capacity,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'CLASS_UPDATED',
            resourceType: 'CLASS',
            resourceId: classId,
            beforeData: {
              name: current.name,
              startDate: this.toDateString(current.startDate),
              endDate: this.toDateString(current.endDate),
              capacity: current.capacity,
            },
            afterData: {
              name,
              startDate: this.toDateString(startDate),
              endDate: this.toDateString(endDate),
              capacity: dto.capacity ?? current.capacity,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });
      });

      return this.findOne(courseOfferingId, classId);
    } catch (error: unknown) {
      this.throwIfDuplicate(error);
      throw error;
    }
  }

  async changeStatus(
    courseOfferingId: string,
    classId: string,
    dto: ChangeClassStatusDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassResponse> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.class.findFirst({
        where: { id: classId, courseOfferingId },
      });

      if (!current) {
        throw new NotFoundException('반을 찾을 수 없습니다.');
      }
      if (!this.canChangeStatus(current.status, dto.status)) {
        throw new ConflictException(
          `${current.status}에서 ${dto.status}(으)로 변경할 수 없습니다.`,
        );
      }

      await tx.class.update({
        where: { id: classId },
        data: { status: dto.status },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_STATUS_CHANGED',
          resourceType: 'CLASS',
          resourceId: classId,
          beforeData: { status: current.status },
          afterData: { status: dto.status },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(courseOfferingId, classId);
  }

  async remove(
    courseOfferingId: string,
    classId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM classes
          WHERE id = ${classId}::uuid
          FOR UPDATE
        `;

        const current = await tx.class.findFirst({
          where: { id: classId, courseOfferingId },
        });

        if (!current) {
          throw new NotFoundException('반을 찾을 수 없습니다.');
        }
        if (current.status !== ClassStatus.PLANNED) {
          throw new ConflictException('예정 상태의 반만 삭제할 수 있습니다.');
        }

        await tx.class.delete({ where: { id: current.id } });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'CLASS_DELETED',
            resourceType: 'CLASS',
            resourceId: current.id,
            beforeData: {
              courseOfferingId: current.courseOfferingId,
              name: current.name,
              startDate: this.toDateString(current.startDate),
              endDate: this.toDateString(current.endDate),
              capacity: current.capacity,
              status: current.status,
            },
            reason: '예정 반 삭제',
            ipAddress,
            result: 'SUCCESS',
          },
        });
      });
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error.code === 'P2003' || error.code === 'P2014')
      ) {
        throw new ConflictException(
          '수업·수강 등 운영 데이터가 연결된 반은 삭제할 수 없습니다.',
        );
      }

      throw error;
    }
  }

  private async assertCourseOfferingExists(id: string): Promise<void> {
    const exists = await this.prisma.courseOffering.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
    }
  }

  private assertDateOrder(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new BadRequestException('시작일은 종료일보다 늦을 수 없습니다.');
    }
  }

  private assertWithinCoursePeriod(
    startDate: Date,
    endDate: Date,
    courseStartDate: Date,
    courseEndDate: Date,
  ): void {
    if (startDate < courseStartDate || endDate > courseEndDate) {
      throw new BadRequestException(
        '반 운영 기간은 개설 강의 기간 안에 있어야 합니다.',
      );
    }
  }

  private canChangeStatus(from: ClassStatus, to: ClassStatus): boolean {
    const transitions: Record<ClassStatus, readonly ClassStatus[]> = {
      [ClassStatus.PLANNED]: [ClassStatus.IN_PROGRESS, ClassStatus.CANCELED],
      [ClassStatus.IN_PROGRESS]: [ClassStatus.COMPLETED, ClassStatus.CANCELED],
      [ClassStatus.COMPLETED]: [],
      [ClassStatus.CANCELED]: [],
    };
    return transitions[from].includes(to);
  }

  private toDate(value: string): Date {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private toDateString(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private optionalText(value?: string): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private throwIfDuplicate(error: unknown): void {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        '같은 개설 강의에 동일한 이름의 반이 이미 있습니다.',
      );
    }
  }

  private toResponse(item: ClassWithRelations): ClassResponse {
    return {
      id: item.id,
      courseOfferingId: item.courseOfferingId,
      name: item.name,
      description: item.description,
      room: item.room,
      startDate: this.toDateString(item.startDate),
      endDate: this.toDateString(item.endDate),
      capacity: item.capacity,
      status: item.status,
      subjects: item.classSubjects.map((classSubject) => ({
        id: classSubject.id,
        courseOfferingSubjectId: classSubject.courseOfferingSubjectId,
        subjectId: classSubject.courseOfferingSubject.subject.id,
        subjectName: classSubject.courseOfferingSubject.subject.name,
        sequence: classSubject.courseOfferingSubject.sequence,
      })),
      currentInstructor: item.instructorAssignments[0]?.instructor ?? null,
      enrollmentCount: item._count.enrollments,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
