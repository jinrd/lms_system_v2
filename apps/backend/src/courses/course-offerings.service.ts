import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { SessionStatus, UserRole, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CourseOfferingQueryDto } from './dto/course-offering-query.dto';
import { CreateCourseOfferingDto } from './dto/create-course-offering.dto';
import { UpdateCourseOfferingDto } from './dto/update-course-offering.dto';

export type CourseOfferingResponse = {
  id: string;
  name: string;
  archived: boolean;
  primaryEducationField: { id: string; name: string };
  instructor: { id: string; name: string; loginId: string | null };
  subjects: Array<{
    id: string;
    subjectId: string;
    name: string;
    educationFieldId: string;
    educationFieldName: string;
  }>;
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

const PROGRAM_INCLUDE = {
  primaryEducationField: { select: { id: true, name: true } },
  instructor: { select: { id: true, name: true, loginId: true } },
  subjects: {
    include: {
      subject: {
        include: {
          educationField: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  _count: { select: { classPrograms: true } },
} as const;

type ProgramWithRelations = Prisma.CourseOfferingGetPayload<{
  include: typeof PROGRAM_INCLUDE;
}>;

@Injectable()
export class CourseOfferingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: CourseOfferingQueryDto,
  ): Promise<CourseOfferingsPageResponse> {
    const keyword = query.keyword?.trim();
    const where: Prisma.CourseOfferingWhereInput = {
      archivedAt: query.archived ? { not: null } : null,
      ...(keyword ? { name: { contains: keyword, mode: 'insensitive' } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const items = await tx.courseOffering.findMany({
        where,
        include: PROGRAM_INCLUDE,
        orderBy: { name: 'asc' },
        skip,
        take: query.limit,
      });
      const total = await tx.courseOffering.count({ where });
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

  async findOne(id: string): Promise<CourseOfferingResponse> {
    const item = await this.prisma.courseOffering.findUnique({
      where: { id },
      include: PROGRAM_INCLUDE,
    });

    if (!item) {
      throw new NotFoundException('교육과정을 찾을 수 없습니다.');
    }

    return this.toResponse(item);
  }

  async create(
    dto: CreateCourseOfferingDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    const id = await this.prisma.$transaction(async (tx) => {
      const field = await tx.educationField.findFirst({
        where: { id: dto.primaryEducationFieldId, active: true },
      });
      const instructor = await tx.user.findFirst({
        where: {
          id: dto.instructorId,
          role: UserRole.INSTRUCTOR,
          status: UserStatus.ACTIVE,
        },
      });
      const subjects = await tx.subject.findMany({
        where: { id: { in: dto.subjectIds }, active: true },
        select: { id: true },
      });

      if (!field) {
        throw new NotFoundException('기본 교육 분야를 찾을 수 없습니다.');
      }
      if (!instructor) {
        throw new NotFoundException('담당 강사를 찾을 수 없습니다.');
      }
      if (subjects.length !== dto.subjectIds.length) {
        throw new NotFoundException(
          '선택한 과목 중 사용할 수 없는 과목이 있습니다.',
        );
      }

      const created = await tx.courseOffering.create({
        data: {
          name: dto.name.trim(),
          primaryEducationFieldId: field.id,
          instructorId: instructor.id,
          createdById: actor.id,
          subjects: {
            create: dto.subjectIds.map((subjectId) => ({ subjectId })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EDUCATION_PROGRAM_CREATED',
          resourceType: 'COURSE_OFFERING',
          resourceId: created.id,
          afterData: {
            name: created.name,
            instructorId: created.instructorId,
            subjectIds: dto.subjectIds,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created.id;
    });

    return this.findOne(id);
  }

  async update(
    id: string,
    dto: UpdateCourseOfferingDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.courseOffering.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('교육과정을 찾을 수 없습니다.');
      }
      if (existing.archivedAt) {
        throw new ConflictException('보관된 교육과정은 수정할 수 없습니다.');
      }

      if (dto.instructorId) {
        const instructor = await tx.user.findFirst({
          where: {
            id: dto.instructorId,
            role: UserRole.INSTRUCTOR,
            status: UserStatus.ACTIVE,
          },
        });
        if (!instructor) {
          throw new NotFoundException('담당 강사를 찾을 수 없습니다.');
        }
      }

      const updated = await tx.courseOffering.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.instructorId ? { instructorId: dto.instructorId } : {}),
        },
      });

      if (dto.instructorId && dto.instructorId !== existing.instructorId) {
        await tx.classSession.updateMany({
          where: {
            classProgram: { courseOfferingId: id },
            status: SessionStatus.SCHEDULED,
          },
          data: { instructorId: dto.instructorId },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EDUCATION_PROGRAM_UPDATED',
          resourceType: 'COURSE_OFFERING',
          resourceId: id,
          beforeData: {
            name: existing.name,
            instructorId: existing.instructorId,
          },
          afterData: {
            name: updated.name,
            instructorId: updated.instructorId,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(id);
  }

  async changeArchive(
    id: string,
    archived: boolean,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingResponse> {
    const existing = await this.prisma.courseOffering.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('교육과정을 찾을 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.courseOffering.update({
        where: { id },
        data: { archivedAt: archived ? new Date() : null },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: archived
            ? 'EDUCATION_PROGRAM_ARCHIVED'
            : 'EDUCATION_PROGRAM_RESTORED',
          resourceType: 'COURSE_OFFERING',
          resourceId: id,
          afterData: { archived },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(id);
  }

  private toResponse(item: ProgramWithRelations): CourseOfferingResponse {
    return {
      id: item.id,
      name: item.name,
      archived: item.archivedAt !== null,
      primaryEducationField: item.primaryEducationField,
      instructor: item.instructor,
      subjects: item.subjects.map((entry) => ({
        id: entry.id,
        subjectId: entry.subject.id,
        name: entry.subject.name,
        educationFieldId: entry.subject.educationField.id,
        educationFieldName: entry.subject.educationField.name,
      })),
      classCount: item._count.classPrograms,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
