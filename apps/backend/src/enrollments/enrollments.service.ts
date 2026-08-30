import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  EnrollmentStatus,
  EnrollmentType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegularEnrollmentDto } from './dto/create-regular-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { ChangeEnrollmentStatusDto } from './dto/change-enrollment-status.dto';

export type EnrollmentResponse = {
  id: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingId: string;
  classId: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  startsOn: string;
  endsOn: string | null;
  reason: string | null;
  attendanceManaged: boolean;
  gradeManaged: boolean;
  subjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    subjectId: string;
    subjectName: string;
    startsOn: string;
    endsOn: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentPageResponse = {
  items: EnrollmentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export type EnrollmentTransferResponse = {
  previousEnrollment: EnrollmentResponse;
  newEnrollment: EnrollmentResponse;
};

const ENROLLMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      loginId: true,
      name: true,
      phone: true,
    },
  },
  subjects: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

type EnrollmentWithRelations = {
  id: string;
  courseOfferingId: string;
  classId: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  startsOn: Date;
  endsOn: Date | null;
  reason: string | null;
  attendanceManaged: boolean;
  gradeManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  subjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    startsOn: Date;
    endsOn: Date | null;
    courseOfferingSubject: {
      sequence: number;
      subject: {
        id: string;
        name: string;
      };
    };
  }>;
};

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
    query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    await this.assertClassExists(courseOfferingId, classId);

    const keyword = query.keyword?.trim();
    const where = {
      courseOfferingId,
      classId,
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            student: {
              OR: [
                {
                  name: {
                    contains: keyword,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  loginId: {
                    contains: keyword,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  phone: {
                    contains: keyword,
                  },
                },
              ],
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        include: ENROLLMENT_INCLUDE,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.enrollment.count({ where }),
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

  async createRegular(
    courseOfferingId: string,
    classId: string,
    dto: CreateRegularEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse> {
    const startsOn = this.toDate(dto.startsOn);
    const endsOn = dto.endsOn ? this.toDate(dto.endsOn) : null;
    const reason = this.optionalText(dto.reason);

    if (endsOn && startsOn > endsOn) {
      throw new BadRequestException(
        '수강 종료일은 시작일보다 빠를 수 없습니다.',
      );
    }

    const enrollmentId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM course_offerings
        WHERE id = ${courseOfferingId}::uuid
        FOR UPDATE
      `;

      const classItem = await tx.class.findFirst({
        where: {
          id: classId,
          courseOfferingId,
        },
        include: {
          classSubjects: {
            select: {
              courseOfferingSubjectId: true,
            },
          },
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
          '완료되거나 취소된 반에는 학생을 배정할 수 없습니다.',
        );
      }

      if (
        startsOn > classItem.endDate ||
        (endsOn && endsOn < classItem.startDate)
      ) {
        throw new BadRequestException(
          '수강 기간은 반 운영 기간과 겹쳐야 합니다.',
        );
      }

      const student = await tx.user.findUnique({
        where: {
          id: dto.studentId,
        },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      if (!student || student.role !== UserRole.STUDENT) {
        throw new NotFoundException('학생 계정을 찾을 수 없습니다.');
      }

      if (student.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 학생만 수강 등록할 수 있습니다.',
        );
      }

      const duplicate = await tx.enrollment.findFirst({
        where: {
          studentId: student.id,
          courseOfferingId,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new ConflictException(
          '이 학생은 해당 개설 강의에 이미 기본 수강 등록되어 있습니다.',
        );
      }

      const currentEnrollmentCount = await tx.enrollment.count({
        where: {
          classId,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
      });

      if (currentEnrollmentCount >= classItem.capacity) {
        throw new ConflictException('반 정원을 초과할 수 없습니다.');
      }

      if (classItem.classSubjects.length === 0) {
        throw new ConflictException(
          '운영 과목이 없는 반에는 학생을 배정할 수 없습니다.',
        );
      }

      const status = this.getInitialStatus(startsOn, endsOn);

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          courseOfferingId,
          classId,
          type: EnrollmentType.REGULAR,
          status,
          startsOn,
          endsOn,
          reason,
          attendanceManaged: true,
          gradeManaged: true,
          assignedById: actor.id,
        },
      });

      await tx.enrollmentSubject.createMany({
        data: classItem.classSubjects.map((subject) => ({
          enrollmentId: enrollment.id,
          courseOfferingId,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          startsOn,
          endsOn,
          attendanceManaged: true,
          gradeManaged: true,
          reason,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'REGULAR_ENROLLMENT_CREATED',
          resourceType: 'ENROLLMENT',
          resourceId: enrollment.id,
          afterData: {
            studentId: student.id,
            courseOfferingId,
            classId,
            type: EnrollmentType.REGULAR,
            status,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn ?? null,
            subjectCount: classItem.classSubjects.length,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return enrollment.id;
    });

    return this.findOne(courseOfferingId, classId, enrollmentId);
  }
  async changeStatus(
    courseOfferingId: string,
    classId: string,
    enrollmentId: string,
    dto: ChangeEnrollmentStatusDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse> {
    const reason = dto.reason.trim();
    const effectiveOn = dto.effectiveOn
      ? this.toDate(dto.effectiveOn)
      : this.getToday();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM course_offerings
        WHERE id = ${courseOfferingId}::uuid
        FOR UPDATE
      `;

      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          courseOfferingId,
          classId,
        },
      });

      if (!enrollment) {
        throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
      }

      this.assertStatusTransition(enrollment.status, dto.status);

      let endsOn = enrollment.endsOn;

      if (dto.status === EnrollmentStatus.ACTIVE) {
        const duplicate = await tx.enrollment.findFirst({
          where: {
            id: {
              not: enrollment.id,
            },
            studentId: enrollment.studentId,
            courseOfferingId,
            type: EnrollmentType.REGULAR,
            status: {
              in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
            },
          },
          select: {
            id: true,
          },
        });

        if (duplicate) {
          throw new ConflictException(
            '이 학생은 해당 개설 강의에 이미 활성 기본 수강 등록되어 있습니다.',
          );
        }

        const classItem = await tx.class.findFirst({
          where: {
            id: classId,
            courseOfferingId,
          },
          select: {
            capacity: true,
            status: true,
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
            '완료되거나 취소된 반의 수강을 시작할 수 없습니다.',
          );
        }

        const activeCount = await tx.enrollment.count({
          where: {
            id: {
              not: enrollment.id,
            },
            classId,
            type: EnrollmentType.REGULAR,
            status: {
              in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
            },
          },
        });

        if (activeCount >= classItem.capacity) {
          throw new ConflictException('반 정원을 초과할 수 없습니다.');
        }
      }

      if (
        dto.status === EnrollmentStatus.COMPLETED ||
        dto.status === EnrollmentStatus.CANCELED
      ) {
        endsOn =
          effectiveOn < enrollment.startsOn ? enrollment.startsOn : effectiveOn;

        await tx.enrollmentSubject.updateMany({
          where: {
            enrollmentId: enrollment.id,
          },
          data: {
            endsOn,
          },
        });
      }

      await tx.enrollment.update({
        where: {
          id: enrollment.id,
        },
        data: {
          status: dto.status,
          endsOn,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ENROLLMENT_STATUS_CHANGED',
          resourceType: 'ENROLLMENT',
          resourceId: enrollment.id,
          beforeData: {
            status: enrollment.status,
            endsOn: enrollment.endsOn?.toISOString().slice(0, 10) ?? null,
          },
          afterData: {
            status: dto.status,
            endsOn: endsOn?.toISOString().slice(0, 10) ?? null,
            effectiveOn: effectiveOn.toISOString().slice(0, 10),
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(courseOfferingId, classId, enrollmentId);
  }

  async transfer(
    courseOfferingId: string,
    classId: string,
    enrollmentId: string,
    dto: TransferEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentTransferResponse> {
    if (dto.targetClassId === classId) {
      throw new BadRequestException('현재 반과 다른 반을 선택해야 합니다.');
    }

    const transferOn = this.toDate(dto.transferOn);
    const reason = dto.reason.trim();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM course_offerings
        WHERE id = ${courseOfferingId}::uuid
        FOR UPDATE
      `;

      const sourceEnrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          courseOfferingId,
          classId,
        },
      });

      if (!sourceEnrollment) {
        throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
      }

      if (sourceEnrollment.type !== EnrollmentType.REGULAR) {
        throw new ConflictException(
          '기본 수강 등록만 다른 반으로 이동할 수 있습니다.',
        );
      }

      if (
        sourceEnrollment.status !== EnrollmentStatus.SCHEDULED &&
        sourceEnrollment.status !== EnrollmentStatus.ACTIVE
      ) {
        throw new ConflictException(
          '예정 또는 수강 중 상태만 반 이동할 수 있습니다.',
        );
      }

      if (transferOn < sourceEnrollment.startsOn) {
        throw new BadRequestException(
          '반 이동일은 기존 수강 시작일보다 빠를 수 없습니다.',
        );
      }

      if (sourceEnrollment.endsOn && transferOn > sourceEnrollment.endsOn) {
        throw new BadRequestException(
          '반 이동일은 기존 수강 종료일보다 늦을 수 없습니다.',
        );
      }

      const targetClass = await tx.class.findFirst({
        where: {
          id: dto.targetClassId,
          courseOfferingId,
        },
        include: {
          classSubjects: {
            select: {
              courseOfferingSubjectId: true,
            },
          },
        },
      });

      if (!targetClass) {
        throw new NotFoundException('이동할 대상 반을 찾을 수 없습니다.');
      }

      if (
        targetClass.status === ClassStatus.COMPLETED ||
        targetClass.status === ClassStatus.CANCELED
      ) {
        throw new ConflictException(
          '완료되거나 취소된 반으로 이동할 수 없습니다.',
        );
      }

      if (
        transferOn < targetClass.startDate ||
        transferOn > targetClass.endDate
      ) {
        throw new BadRequestException(
          '반 이동일은 대상 반 운영 기간 안에 있어야 합니다.',
        );
      }

      if (targetClass.classSubjects.length === 0) {
        throw new ConflictException(
          '운영 과목이 없는 반으로 이동할 수 없습니다.',
        );
      }

      const targetEnrollmentCount = await tx.enrollment.count({
        where: {
          classId: targetClass.id,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
      });

      if (targetEnrollmentCount >= targetClass.capacity) {
        throw new ConflictException('이동할 대상 반의 정원이 가득 찼습니다.');
      }

      const conflictingEnrollment = await tx.enrollment.findFirst({
        where: {
          id: {
            not: sourceEnrollment.id,
          },
          studentId: sourceEnrollment.studentId,
          courseOfferingId,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
        select: {
          id: true,
        },
      });

      if (conflictingEnrollment) {
        throw new ConflictException(
          '이 학생에게 다른 활성 기본 수강 등록이 존재합니다.',
        );
      }

      const previousStatus =
        sourceEnrollment.status === EnrollmentStatus.SCHEDULED
          ? EnrollmentStatus.CANCELED
          : EnrollmentStatus.COMPLETED;

      await tx.enrollment.update({
        where: {
          id: sourceEnrollment.id,
        },
        data: {
          status: previousStatus,
          endsOn: transferOn,
        },
      });

      await tx.enrollmentSubject.updateMany({
        where: {
          enrollmentId: sourceEnrollment.id,
        },
        data: {
          endsOn: transferOn,
        },
      });

      const requestedEndDate = sourceEnrollment.endsOn ?? targetClass.endDate;

      const newEndsOn =
        requestedEndDate > targetClass.endDate
          ? targetClass.endDate
          : requestedEndDate;

      if (newEndsOn < transferOn) {
        throw new BadRequestException(
          '대상 반에서 유효한 수강 기간을 만들 수 없습니다.',
        );
      }

      const newStatus =
        transferOn > this.getToday()
          ? EnrollmentStatus.SCHEDULED
          : EnrollmentStatus.ACTIVE;

      const newEnrollment = await tx.enrollment.create({
        data: {
          studentId: sourceEnrollment.studentId,
          courseOfferingId,
          classId: targetClass.id,
          type: EnrollmentType.REGULAR,
          status: newStatus,
          startsOn: transferOn,
          endsOn: newEndsOn,
          reason,
          attendanceManaged: sourceEnrollment.attendanceManaged,
          gradeManaged: sourceEnrollment.gradeManaged,
          assignedById: actor.id,
        },
      });

      await tx.enrollmentSubject.createMany({
        data: targetClass.classSubjects.map((subject) => ({
          enrollmentId: newEnrollment.id,
          courseOfferingId,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          startsOn: transferOn,
          endsOn: newEndsOn,
          attendanceManaged: sourceEnrollment.attendanceManaged,
          gradeManaged: sourceEnrollment.gradeManaged,
          reason,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ENROLLMENT_CLASS_TRANSFERRED',
          resourceType: 'ENROLLMENT',
          resourceId: sourceEnrollment.id,
          beforeData: {
            enrollmentId: sourceEnrollment.id,
            classId,
            status: sourceEnrollment.status,
          },
          afterData: {
            previousEnrollmentStatus: previousStatus,
            newEnrollmentId: newEnrollment.id,
            targetClassId: targetClass.id,
            newEnrollmentStatus: newStatus,
            transferOn: dto.transferOn,
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        previousEnrollmentId: sourceEnrollment.id,
        newEnrollmentId: newEnrollment.id,
        targetClassId: targetClass.id,
      };
    });

    const [previousEnrollment, newEnrollment] = await Promise.all([
      this.findOne(courseOfferingId, classId, result.previousEnrollmentId),
      this.findOne(
        courseOfferingId,
        result.targetClassId,
        result.newEnrollmentId,
      ),
    ]);

    return {
      previousEnrollment,
      newEnrollment,
    };
  }
  private async findOne(
    courseOfferingId: string,
    classId: string,
    enrollmentId: string,
  ): Promise<EnrollmentResponse> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        courseOfferingId,
        classId,
      },
      include: ENROLLMENT_INCLUDE,
    });

    if (!enrollment) {
      throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
    }

    return this.toResponse(enrollment);
  }

  private async assertClassExists(
    courseOfferingId: string,
    classId: string,
  ): Promise<void> {
    const exists = await this.prisma.class.findFirst({
      where: {
        id: classId,
        courseOfferingId,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
  }

  private assertStatusTransition(
    currentStatus: EnrollmentStatus,
    nextStatus: EnrollmentStatus,
  ): void {
    const transitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
      SCHEDULED: [EnrollmentStatus.ACTIVE, EnrollmentStatus.CANCELED],
      ACTIVE: [EnrollmentStatus.COMPLETED, EnrollmentStatus.CANCELED],
      COMPLETED: [],
      CANCELED: [],
    };

    if (!transitions[currentStatus].includes(nextStatus)) {
      throw new ConflictException(
        `${currentStatus} 상태에서 ${nextStatus} 상태로 변경할 수 없습니다.`,
      );
    }
  }

  private getToday(): Date {
    return this.toDate(
      new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Seoul',
      }),
    );
  }

  private getInitialStatus(
    startsOn: Date,
    endsOn: Date | null,
  ): EnrollmentStatus {
    const today = this.getToday();

    if (endsOn && endsOn < today) {
      throw new BadRequestException(
        '이미 종료된 기간으로 신규 수강 등록할 수 없습니다.',
      );
    }

    return startsOn > today
      ? EnrollmentStatus.SCHEDULED
      : EnrollmentStatus.ACTIVE;
  }

  private toDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('올바른 날짜를 입력해야 합니다.');
    }

    return date;
  }

  private optionalText(value?: string): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  private toResponse(item: EnrollmentWithRelations): EnrollmentResponse {
    return {
      id: item.id,
      student: item.student,
      courseOfferingId: item.courseOfferingId,
      classId: item.classId,
      type: item.type,
      status: item.status,
      startsOn: item.startsOn.toISOString().slice(0, 10),
      endsOn: item.endsOn?.toISOString().slice(0, 10) ?? null,
      reason: item.reason,
      attendanceManaged: item.attendanceManaged,
      gradeManaged: item.gradeManaged,
      subjects: [...item.subjects]
        .sort(
          (left, right) =>
            left.courseOfferingSubject.sequence -
            right.courseOfferingSubject.sequence,
        )
        .map((subject) => ({
          id: subject.id,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          subjectId: subject.courseOfferingSubject.subject.id,
          subjectName: subject.courseOfferingSubject.subject.name,
          startsOn: subject.startsOn.toISOString().slice(0, 10),
          endsOn: subject.endsOn?.toISOString().slice(0, 10) ?? null,
        })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
