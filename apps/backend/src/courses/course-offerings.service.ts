import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { CourseStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeCourseStatusDto } from './dto/change-course-status.dto';
import { CourseOfferingQueryDto } from './dto/course-offering-query.dto';
import { CreateCourseOfferingDto } from './dto/create-course-offering.dto';
import { UpdateCourseOfferingDto } from './dto/update-course-offering.dto';

export type CourseOfferingResponse = {
  id: string;
  name: string;
  description: string | null;
  curriculum: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: CourseStatus;
  createdById: string | null;
  subjectCount: number;
  classCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CourseOfferingsPageResponse = {
  items: CourseOfferingResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<CourseStatus, readonly CourseStatus[]>
> = {
  [CourseStatus.PLANNED]: [CourseStatus.RECRUITING, CourseStatus.CANCELED],
  [CourseStatus.RECRUITING]: [CourseStatus.IN_PROGRESS, CourseStatus.CANCELED],
  [CourseStatus.IN_PROGRESS]: [CourseStatus.COMPLETED, CourseStatus.CANCELED],
  [CourseStatus.COMPLETED]: [],
  [CourseStatus.CANCELED]: [CourseStatus.PLANNED],
};

@Injectable()
export class CourseOfferingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: CourseOfferingQueryDto,
  ): Promise<CourseOfferingsPageResponse> {
    const keyword = query.keyword?.trim();
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.CourseOfferingWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            name: {
              contains: keyword,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.courseOffering.findMany({
        where,
        include: {
          _count: {
            select: {
              subjects: true,
              classes: true,
            },
          },
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.courseOffering.count({ where }),
    ]);

    return {
      items: courses.map((course) => this.toResponse(course)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<CourseOfferingResponse> {
    const course = await this.prisma.courseOffering.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            subjects: true,
            classes: true,
          },
        },
      },
    });

    if (!course) {
      throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
    }

    return this.toResponse(course);
  }

  async create(
    dto: CreateCourseOfferingDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    this.validateDates(startDate, endDate);

    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.courseOffering.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          curriculum: dto.curriculum?.trim() || null,
          startDate,
          endDate,
          capacity: dto.capacity,
          status: CourseStatus.PLANNED,
          createdById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'COURSE_OFFERING_CREATED',
          resourceType: 'COURSE_OFFERING',
          resourceId: created.id,
          afterData: {
            name: created.name,
            startDate: this.toDateString(created.startDate),
            endDate: this.toDateString(created.endDate),
            capacity: created.capacity,
            status: created.status,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created;
    });

    return this.toResponse({
      ...course,
      _count: {
        subjects: 0,
        classes: 0,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCourseOfferingDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    const course = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
          SELECT id
          FROM course_offerings
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;

      const existing = await tx.courseOffering.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
      }

      if (existing.status === CourseStatus.COMPLETED) {
        throw new ConflictException('완료된 강의는 수정할 수 없습니다.');
      }

      const startDate = dto.startDate
        ? new Date(dto.startDate)
        : existing.startDate;
      const endDate = dto.endDate ? new Date(dto.endDate) : existing.endDate;

      this.validateDates(startDate, endDate);

      if (dto.startDate || dto.endDate) {
        const invalidClassCount = await tx.class.count({
          where: {
            courseOfferingId: existing.id,
            OR: [
              {
                startDate: {
                  lt: startDate,
                },
              },
              {
                endDate: {
                  gt: endDate,
                },
              },
            ],
          },
        });

        if (invalidClassCount > 0) {
          throw new ConflictException(
            '변경하려는 강의 기간 밖에 운영되는 반이 있습니다.',
          );
        }
      }

      const updated = await tx.courseOffering.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? {
                description: dto.description.trim() || null,
              }
            : {}),
          ...(dto.curriculum !== undefined
            ? {
                curriculum: dto.curriculum.trim() || null,
              }
            : {}),
          startDate,
          endDate,
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'COURSE_OFFERING_UPDATED',
          resourceType: 'COURSE_OFFERING',
          resourceId: updated.id,
          beforeData: {
            name: existing.name,
            startDate: this.toDateString(existing.startDate),
            endDate: this.toDateString(existing.endDate),
            capacity: existing.capacity,
          },
          afterData: {
            name: updated.name,
            startDate: this.toDateString(updated.startDate),
            endDate: this.toDateString(updated.endDate),
            capacity: updated.capacity,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return updated;
    });

    const counts = await this.getCounts(course.id);

    return this.toResponse({
      ...course,
      _count: counts,
    });
  }

  async changeStatus(
    id: string,
    dto: ChangeCourseStatusDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    const course = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
          SELECT id
          FROM course_offerings
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;

      const existing = await tx.courseOffering.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              subjects: true,
              classes: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
      }

      if (existing.status === dto.status) {
        return existing;
      }

      if (!ALLOWED_STATUS_TRANSITIONS[existing.status].includes(dto.status)) {
        throw new ConflictException(
          `${existing.status} 상태에서 ${dto.status} 상태로 변경할 수 없습니다.`,
        );
      }

      if (
        dto.status === CourseStatus.RECRUITING &&
        existing._count.subjects === 0
      ) {
        throw new ConflictException(
          '과목을 하나 이상 구성한 후 모집 상태로 변경할 수 있습니다.',
        );
      }

      if (
        dto.status === CourseStatus.IN_PROGRESS &&
        existing._count.classes === 0
      ) {
        throw new ConflictException(
          '반을 하나 이상 생성한 후 진행 상태로 변경할 수 있습니다.',
        );
      }

      const updated = await tx.courseOffering.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
        },
        include: {
          _count: {
            select: {
              subjects: true,
              classes: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'COURSE_OFFERING_STATUS_CHANGED',
          resourceType: 'COURSE_OFFERING',
          resourceId: updated.id,
          beforeData: {
            status: existing.status,
          },
          afterData: {
            status: updated.status,
          },
          reason: dto.reason.trim(),
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return updated;
    });

    return this.toResponse(course);
  }

  private validateDates(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new BadRequestException(
        '강의 시작일은 종료일보다 늦을 수 없습니다.',
      );
    }
  }

  private async getCounts(id: string): Promise<{
    subjects: number;
    classes: number;
  }> {
    const [subjects, classes] = await this.prisma.$transaction([
      this.prisma.courseOfferingSubject.count({
        where: { courseOfferingId: id },
      }),
      this.prisma.class.count({
        where: { courseOfferingId: id },
      }),
    ]);

    return { subjects, classes };
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private toResponse(course: {
    id: string;
    name: string;
    description: string | null;
    curriculum: string | null;
    startDate: Date;
    endDate: Date;
    capacity: number;
    status: CourseStatus;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      subjects: number;
      classes: number;
    };
  }): CourseOfferingResponse {
    return {
      id: course.id,
      name: course.name,
      description: course.description,
      curriculum: course.curriculum,
      startDate: this.toDateString(course.startDate),
      endDate: this.toDateString(course.endDate),
      capacity: course.capacity,
      status: course.status,
      createdById: course.createdById,
      subjectCount: course._count.subjects,
      classCount: course._count.classes,
      createdAt: course.createdAt.toISOString(),
      updatedAt: course.updatedAt.toISOString(),
    };
  }
}
