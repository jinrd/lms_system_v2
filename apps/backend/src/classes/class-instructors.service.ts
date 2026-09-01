import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  SessionStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { toSeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';
import { AssignClassInstructorDto } from './dto/assign-class-instructor.dto';

export type ClassInstructorAssignmentResponse = {
  id: string;
  classId: string;
  instructor: {
    id: string;
    name: string;
    loginId: string | null;
  };
  assignedFrom: string;
  assignedTo: string | null;
  assignedBy: {
    id: string;
    name: string;
  } | null;
  reason: string | null;
  current: boolean;
  createdAt: string;
};

@Injectable()
export class ClassInstructorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findHistory(
    courseOfferingId: string,
    classId: string,
  ): Promise<ClassInstructorAssignmentResponse[]> {
    await this.assertClassExists(courseOfferingId, classId);

    const assignments = await this.prisma.classInstructorAssignment.findMany({
      where: {
        classId,
      },
      include: {
        instructor: {
          select: {
            id: true,
            name: true,
            loginId: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        assignedFrom: 'desc',
      },
    });

    return assignments.map((assignment) => this.toResponse(assignment));
  }

  async assign(
    courseOfferingId: string,
    classId: string,
    dto: AssignClassInstructorDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassInstructorAssignmentResponse> {
    const assignedFrom = new Date(dto.assignedFrom);
    const scheduledSessionBoundary = new Date(
      `${dto.assignedFrom}T00:00:00+09:00`,
    );
    const reason = dto.reason.trim();

    try {
      const assignment = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            SELECT id
            FROM classes
            WHERE id = ${classId}::uuid
            FOR UPDATE
          `;

        const classItem = await tx.class.findFirst({
          where: {
            id: classId,
            courseOfferingId,
          },
        });

        if (!classItem) {
          throw new NotFoundException('반을 찾을 수 없습니다.');
        }

        if (
          classItem.status === ClassStatus.COMPLETED ||
          classItem.status === ClassStatus.CANCELED
        ) {
          throw new ConflictException(
            '완료되거나 취소된 반에는 강사를 배정할 수 없습니다.',
          );
        }

        if (
          assignedFrom < classItem.startDate ||
          assignedFrom > classItem.endDate
        ) {
          throw new BadRequestException(
            '담당 시작일은 반 운영 기간 안에 있어야 합니다.',
          );
        }

        const instructor = await tx.user.findUnique({
          where: {
            id: dto.instructorId,
          },
        });

        if (
          !instructor ||
          instructor.role !== UserRole.INSTRUCTOR ||
          instructor.status !== UserStatus.ACTIVE
        ) {
          throw new NotFoundException(
            '배정할 수 있는 활성 강사를 찾을 수 없습니다.',
          );
        }

        const currentAssignment = await tx.classInstructorAssignment.findFirst({
          where: {
            classId: classItem.id,
            assignedTo: null,
          },
          include: {
            instructor: true,
          },
        });

        if (currentAssignment?.instructorId === instructor.id) {
          throw new ConflictException(
            '이미 현재 담당 강사로 배정되어 있습니다.',
          );
        }

        if (currentAssignment) {
          if (assignedFrom <= currentAssignment.assignedFrom) {
            throw new BadRequestException(
              '새 담당 시작일은 기존 담당 시작일보다 늦어야 합니다.',
            );
          }

          if (!dto.handoverTitle?.trim() || !dto.handoverContent?.trim()) {
            throw new BadRequestException(
              '강사 변경 시 인수인계 제목과 내용이 필요합니다.',
            );
          }

          const previousAssignedTo = new Date(assignedFrom);
          previousAssignedTo.setUTCDate(previousAssignedTo.getUTCDate() - 1);

          await tx.classInstructorAssignment.update({
            where: {
              id: currentAssignment.id,
            },
            data: {
              assignedTo: previousAssignedTo,
            },
          });

          await tx.handover.create({
            data: {
              classId: classItem.id,
              fromInstructorId: currentAssignment.instructorId,
              toInstructorId: instructor.id,
              title: dto.handoverTitle.trim(),
              content: dto.handoverContent.trim(),
              createdById: actor.id,
            },
          });
        }

        const created = await tx.classInstructorAssignment.create({
          data: {
            classId: classItem.id,
            instructorId: instructor.id,
            assignedFrom,
            assignedById: actor.id,
            reason,
          },
          include: {
            instructor: {
              select: {
                id: true,
                name: true,
                loginId: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        const updatedSessions = await tx.classSession.updateMany({
          where: {
            classId: classItem.id,
            status: SessionStatus.SCHEDULED,
            startsAt: {
              gte: scheduledSessionBoundary,
            },
          },
          data: {
            instructorId: instructor.id,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: currentAssignment
              ? 'CLASS_INSTRUCTOR_CHANGED'
              : 'CLASS_INSTRUCTOR_ASSIGNED',
            resourceType: 'CLASS_INSTRUCTOR_ASSIGNMENT',
            resourceId: created.id,
            beforeData: currentAssignment
              ? {
                  instructorId: currentAssignment.instructorId,
                  instructorName: currentAssignment.instructor.name,
                  assignedFrom: this.toDateString(
                    currentAssignment.assignedFrom,
                  ),
                }
              : undefined,
            afterData: {
              classId: classItem.id,
              instructorId: instructor.id,
              instructorName: instructor.name,
              assignedFrom: this.toDateString(assignedFrom),
              scheduledSessionsUpdated: updatedSessions.count,
            },
            reason,
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(assignment);
    } catch (error: unknown) {
      if (this.isAssignmentConstraintError(error)) {
        throw new ConflictException(
          '담당 강사 기간이 기존 배정 기간과 겹칩니다.',
        );
      }

      throw error;
    }
  }

  private async assertClassExists(
    courseOfferingId: string,
    classId: string,
  ): Promise<void> {
    const classItem = await this.prisma.class.findFirst({
      where: {
        id: classId,
        courseOfferingId,
      },
      select: {
        id: true,
      },
    });

    if (!classItem) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
  }

  private toDateString(date: Date): string {
    return toSeoulDateString(date);
  }

  private toResponse(assignment: {
    id: string;
    classId: string;
    assignedFrom: Date;
    assignedTo: Date | null;
    reason: string | null;
    createdAt: Date;
    instructor: {
      id: string;
      name: string;
      loginId: string | null;
    };
    assignedBy: {
      id: string;
      name: string;
    } | null;
  }): ClassInstructorAssignmentResponse {
    return {
      id: assignment.id,
      classId: assignment.classId,
      instructor: assignment.instructor,
      assignedFrom: this.toDateString(assignment.assignedFrom),
      assignedTo: assignment.assignedTo
        ? this.toDateString(assignment.assignedTo)
        : null,
      assignedBy: assignment.assignedBy,
      reason: assignment.reason,
      current: assignment.assignedTo === null,
      createdAt: assignment.createdAt.toISOString(),
    };
  }

  private isAssignmentConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002' || error.code === 'P2004';
  }
}
