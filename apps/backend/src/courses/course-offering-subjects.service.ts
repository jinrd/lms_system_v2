import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ClassStatus, CourseStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AddCourseOfferingSubjectDto } from './dto/add-course-offering-subject.dto';
import { UpdateCourseOfferingSubjectDto } from './dto/update-course-offering-subject.dto';

export type CourseOfferingSubjectResponse = {
  id: string;
  courseOfferingId: string;
  subjectId: string;
  subjectName: string;
  educationFieldId: string;
  educationFieldName: string;
  sequence: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  plannedMinutes: number | null;
  curriculum: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class CourseOfferingSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
  ): Promise<CourseOfferingSubjectResponse[]> {
    await this.assertCourseExists(courseOfferingId);

    const subjects = await this.prisma.courseOfferingSubject.findMany({
      where: {
        courseOfferingId,
      },
      include: {
        subject: {
          include: {
            educationField: true,
          },
        },
      },
      orderBy: {
        sequence: 'asc',
      },
    });

    return subjects.map((subject) => this.toResponse(subject));
  }

  async add(
    courseOfferingId: string,
    dto: AddCourseOfferingSubjectDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingSubjectResponse> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            SELECT id
            FROM course_offerings
            WHERE id = ${courseOfferingId}::uuid
            FOR UPDATE
          `;

        const course = await tx.courseOffering.findUnique({
          where: {
            id: courseOfferingId,
          },
        });

        if (!course) {
          throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
        }

        this.assertCourseIsEditable(course.status);

        const subject = await tx.subject.findUnique({
          where: {
            id: dto.subjectId,
          },
          include: {
            educationField: true,
          },
        });

        if (!subject || !subject.active || !subject.educationField.active) {
          throw new NotFoundException(
            '사용 가능한 세부 과목을 찾을 수 없습니다.',
          );
        }

        const plannedStartDate = dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : null;
        const plannedEndDate = dto.plannedEndDate
          ? new Date(dto.plannedEndDate)
          : null;

        this.validatePlannedDates(
          course.startDate,
          course.endDate,
          plannedStartDate,
          plannedEndDate,
        );

        const created = await tx.courseOfferingSubject.create({
          data: {
            courseOfferingId: course.id,
            subjectId: subject.id,
            sequence: dto.sequence,
            plannedStartDate,
            plannedEndDate,
            plannedMinutes: dto.plannedMinutes,
            curriculum: dto.curriculum?.trim() || null,
          },
          include: {
            subject: {
              include: {
                educationField: true,
              },
            },
          },
        });

        const plannedClasses = await tx.class.findMany({
          where: {
            courseOfferingId: course.id,
            status: ClassStatus.PLANNED,
          },
          select: {
            id: true,
          },
        });

        if (plannedClasses.length > 0) {
          await tx.classSubject.createMany({
            data: plannedClasses.map((classItem) => ({
              classId: classItem.id,
              courseOfferingId: course.id,
              courseOfferingSubjectId: created.id,
            })),
            skipDuplicates: true,
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'COURSE_OFFERING_SUBJECT_ADDED',
            resourceType: 'COURSE_OFFERING_SUBJECT',
            resourceId: created.id,
            afterData: {
              courseOfferingId: created.courseOfferingId,
              subjectId: created.subjectId,
              subjectName: subject.name,
              sequence: created.sequence,
              plannedStartDate:
                created.plannedStartDate?.toISOString().slice(0, 10) ?? null,
              plannedEndDate:
                created.plannedEndDate?.toISOString().slice(0, 10) ?? null,
              plannedMinutes: created.plannedMinutes,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(result);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          '같은 과목 또는 교육 순서가 이미 등록되어 있습니다.',
        );
      }

      throw error;
    }
  }

  async update(
    courseOfferingId: string,
    courseOfferingSubjectId: string,
    dto: UpdateCourseOfferingSubjectDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<CourseOfferingSubjectResponse> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            SELECT id
            FROM course_offerings
            WHERE id = ${courseOfferingId}::uuid
            FOR UPDATE
          `;

        const existing = await tx.courseOfferingSubject.findFirst({
          where: {
            id: courseOfferingSubjectId,
            courseOfferingId,
          },
          include: {
            courseOffering: true,
            subject: {
              include: {
                educationField: true,
              },
            },
          },
        });

        if (!existing) {
          throw new NotFoundException('개설 강의 과목을 찾을 수 없습니다.');
        }

        this.assertCourseIsEditable(existing.courseOffering.status);

        const plannedStartDate =
          dto.plannedStartDate !== undefined
            ? new Date(dto.plannedStartDate)
            : existing.plannedStartDate;

        const plannedEndDate =
          dto.plannedEndDate !== undefined
            ? new Date(dto.plannedEndDate)
            : existing.plannedEndDate;

        this.validatePlannedDates(
          existing.courseOffering.startDate,
          existing.courseOffering.endDate,
          plannedStartDate,
          plannedEndDate,
        );

        const updated = await tx.courseOfferingSubject.update({
          where: {
            id: existing.id,
          },
          data: {
            ...(dto.sequence !== undefined ? { sequence: dto.sequence } : {}),
            plannedStartDate,
            plannedEndDate,
            ...(dto.plannedMinutes !== undefined
              ? {
                  plannedMinutes: dto.plannedMinutes,
                }
              : {}),
            ...(dto.curriculum !== undefined
              ? {
                  curriculum: dto.curriculum.trim() || null,
                }
              : {}),
          },
          include: {
            subject: {
              include: {
                educationField: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'COURSE_OFFERING_SUBJECT_UPDATED',
            resourceType: 'COURSE_OFFERING_SUBJECT',
            resourceId: updated.id,
            beforeData: {
              sequence: existing.sequence,
              plannedStartDate:
                existing.plannedStartDate?.toISOString().slice(0, 10) ?? null,
              plannedEndDate:
                existing.plannedEndDate?.toISOString().slice(0, 10) ?? null,
              plannedMinutes: existing.plannedMinutes,
              curriculum: existing.curriculum,
            },
            afterData: {
              sequence: updated.sequence,
              plannedStartDate:
                updated.plannedStartDate?.toISOString().slice(0, 10) ?? null,
              plannedEndDate:
                updated.plannedEndDate?.toISOString().slice(0, 10) ?? null,
              plannedMinutes: updated.plannedMinutes,
              curriculum: updated.curriculum,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return updated;
      });

      return this.toResponse(result);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('같은 교육 순서가 이미 등록되어 있습니다.');
      }

      throw error;
    }
  }

  async remove(
    courseOfferingId: string,
    courseOfferingSubjectId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM course_offerings
        WHERE id = ${courseOfferingId}::uuid
        FOR UPDATE
      `;

      const existing = await tx.courseOfferingSubject.findFirst({
        where: {
          id: courseOfferingSubjectId,
          courseOfferingId,
        },
        include: {
          courseOffering: true,
          subject: true,
          _count: {
            select: {
              classSubjects: true,
              classSessions: true,
              enrollmentSubjects: true,
              sessionParticipants: true,
              attendanceRecords: true,
              examSubjects: true,
              examQuestions: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('개설 강의 과목을 찾을 수 없습니다.');
      }

      this.assertCourseIsEditable(existing.courseOffering.status);

      const referenceCount = Object.values(existing._count).reduce(
        (total, count) => total + count,
        0,
      );

      if (referenceCount > 0) {
        throw new ConflictException(
          '반·수강·출석·시험에서 참조 중인 과목은 제거할 수 없습니다.',
        );
      }

      await tx.courseOfferingSubject.delete({
        where: {
          id: existing.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'COURSE_OFFERING_SUBJECT_REMOVED',
          resourceType: 'COURSE_OFFERING_SUBJECT',
          resourceId: existing.id,
          beforeData: {
            courseOfferingId: existing.courseOfferingId,
            subjectId: existing.subjectId,
            subjectName: existing.subject.name,
            sequence: existing.sequence,
          },
          reason: '개설 강의 과목 구성에서 제거',
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });
  }

  private async assertCourseExists(id: string): Promise<void> {
    const course = await this.prisma.courseOffering.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!course) {
      throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
    }
  }

  private assertCourseIsEditable(status: CourseStatus): void {
    if (status !== CourseStatus.PLANNED) {
      throw new ConflictException(
        '계획 상태의 강의만 과목 구성을 변경할 수 있습니다.',
      );
    }
  }

  private validatePlannedDates(
    courseStartDate: Date,
    courseEndDate: Date,
    plannedStartDate: Date | null,
    plannedEndDate: Date | null,
  ): void {
    if (
      plannedStartDate &&
      plannedEndDate &&
      plannedStartDate > plannedEndDate
    ) {
      throw new BadRequestException(
        '과목 계획 시작일은 종료일보다 늦을 수 없습니다.',
      );
    }

    if (
      (plannedStartDate && plannedStartDate < courseStartDate) ||
      (plannedEndDate && plannedEndDate > courseEndDate)
    ) {
      throw new BadRequestException(
        '과목 계획 기간은 개설 강의 기간 안에 있어야 합니다.',
      );
    }
  }

  private toResponse(subject: {
    id: string;
    courseOfferingId: string;
    subjectId: string;
    sequence: number;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    plannedMinutes: number | null;
    curriculum: string | null;
    createdAt: Date;
    updatedAt: Date;
    subject: {
      name: string;
      educationFieldId: string;
      educationField: {
        name: string;
      };
    };
  }): CourseOfferingSubjectResponse {
    return {
      id: subject.id,
      courseOfferingId: subject.courseOfferingId,
      subjectId: subject.subjectId,
      subjectName: subject.subject.name,
      educationFieldId: subject.subject.educationFieldId,
      educationFieldName: subject.subject.educationField.name,
      sequence: subject.sequence,
      plannedStartDate:
        subject.plannedStartDate?.toISOString().slice(0, 10) ?? null,
      plannedEndDate:
        subject.plannedEndDate?.toISOString().slice(0, 10) ?? null,
      plannedMinutes: subject.plannedMinutes,
      curriculum: subject.curriculum,
      createdAt: subject.createdAt.toISOString(),
      updatedAt: subject.updatedAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
