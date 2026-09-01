import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  EnrollmentStatus,
  EnrollmentType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import { todaySeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegularEnrollmentDto } from './dto/create-regular-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import { CreateSubjectEnrollmentDto } from './dto/create-subject-enrollment.dto';
import { WithdrawEnrollmentDto } from './dto/withdraw-enrollment.dto';

/**
 * 반 학생은 반에 포함된 모든 교육과정을 수강한다.
 * 따라서 학생 한 명을 반에 배정하면 반의 교육과정 수만큼 수강 등록 행이 생긴다.
 * 각 행은 자기 교육과정의 과목만 `enrollment_subjects`로 갖는다.
 */
export type EnrollmentResponse = {
  id: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingId: string;
  courseOfferingName: string;
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
  previousEnrollments: EnrollmentResponse[];
  newEnrollments: EnrollmentResponse[];
};

const ENROLLMENT_INCLUDE = {
  student: {
    select: { id: true, loginId: true, name: true, phone: true },
  },
  courseOffering: {
    select: { id: true, name: true },
  },
  subjects: {
    include: {
      courseOfferingSubject: {
        include: { subject: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

type EnrollmentWithRelations = Prisma.EnrollmentGetPayload<{
  include: typeof ENROLLMENT_INCLUDE;
}>;

const ACTIVE_STATUSES = [
  EnrollmentStatus.SCHEDULED,
  EnrollmentStatus.ACTIVE,
] as EnrollmentStatus[];

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    classId: string,
    query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    await this.assertClassExists(classId);
    await this.synchronizeEnrollmentStatuses(classId);

    const where: Prisma.EnrollmentWhereInput = {
      classId,
      ...(query.status ? { status: query.status } : {}),
      ...this.keywordFilter(query.keyword),
    };

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const items = await tx.enrollment.findMany({
        where,
        include: ENROLLMENT_INCLUDE,
        orderBy: [
          { student: { name: 'asc' } },
          { courseOffering: { name: 'asc' } },
        ],
        skip,
        take: query.limit,
      });
      const total = await tx.enrollment.count({ where });
      return [items, total] as const;
    });

    return this.toPage(items, total, query);
  }

  /** 대상 반에서 운영하는 교육과정을 이미 다른 반에서 수강 중인 학생 목록 */
  async findSubjectCandidates(
    targetClassId: string,
    query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    const targetClass = await this.prisma.class.findUnique({
      where: { id: targetClassId },
      include: { programs: { select: { courseOfferingId: true } } },
    });

    if (!targetClass) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }

    const where: Prisma.EnrollmentWhereInput = {
      classId: { not: targetClassId },
      courseOfferingId: {
        in: targetClass.programs.map((program) => program.courseOfferingId),
      },
      type: EnrollmentType.REGULAR,
      status: { in: ACTIVE_STATUSES },
      student: { status: UserStatus.ACTIVE },
      ...this.keywordFilter(query.keyword),
    };

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction(async (tx) => {
      const items = await tx.enrollment.findMany({
        where,
        include: ENROLLMENT_INCLUDE,
        orderBy: [{ student: { name: 'asc' } }, { startsOn: 'desc' }],
        skip,
        take: query.limit,
      });
      const total = await tx.enrollment.count({ where });
      return [items, total] as const;
    });

    return this.toPage(items, total, query);
  }

  /** 반 배정: 반에 포함된 모든 교육과정에 대해 기본 수강 등록을 생성한다. */
  async createRegular(
    classId: string,
    dto: CreateRegularEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse[]> {
    const startsOn = this.toDate(dto.startsOn);
    const endsOn = dto.endsOn ? this.toDate(dto.endsOn) : null;
    const reason = this.optionalText(dto.reason);

    if (endsOn && startsOn > endsOn) {
      throw new BadRequestException(
        '수강 종료일은 시작일보다 빠를 수 없습니다.',
      );
    }

    const enrollmentIds = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM classes
        WHERE id = ${classId}::uuid
        FOR UPDATE
      `;

      const classItem = await tx.class.findUnique({
        where: { id: classId },
        include: {
          programs: {
            include: {
              courseOffering: { select: { id: true, name: true } },
              classSubjects: {
                where: { active: true },
                select: { courseOfferingSubjectId: true },
              },
            },
          },
        },
      });

      if (!classItem) {
        throw new NotFoundException('반을 찾을 수 없습니다.');
      }
      if (classItem.archivedAt) {
        throw new ConflictException('보관된 반에는 학생을 배정할 수 없습니다.');
      }
      if (classItem.programs.length === 0) {
        throw new ConflictException(
          '교육과정이 없는 반에는 학생을 배정할 수 없습니다.',
        );
      }

      const emptyProgram = classItem.programs.find(
        (program) => program.classSubjects.length === 0,
      );
      if (emptyProgram) {
        throw new ConflictException(
          `운영 과목이 없는 교육과정이 있습니다: ${emptyProgram.courseOffering.name}`,
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
        where: { id: dto.studentId },
        select: { id: true, role: true, status: true },
      });

      if (!student || student.role !== UserRole.STUDENT) {
        throw new NotFoundException('학생 계정을 찾을 수 없습니다.');
      }
      if (student.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 학생만 수강 등록할 수 있습니다.',
        );
      }

      // 같은 교육과정에서 활성 기본 반은 1개만 가질 수 있다.
      const duplicates = await tx.enrollment.findMany({
        where: {
          studentId: student.id,
          courseOfferingId: {
            in: classItem.programs.map((program) => program.courseOfferingId),
          },
          type: EnrollmentType.REGULAR,
          status: { in: ACTIVE_STATUSES },
        },
        include: { courseOffering: { select: { name: true } } },
      });

      if (duplicates.length > 0) {
        throw new ConflictException(
          `이 학생은 다음 교육과정에 이미 기본 수강 등록되어 있습니다: ${duplicates
            .map((item) => item.courseOffering.name)
            .join(', ')}`,
        );
      }

      await this.assertCapacity(tx, classItem.id, classItem.capacity);

      const status = this.getInitialStatus(startsOn, endsOn);
      const createdIds: string[] = [];

      for (const program of classItem.programs) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: student.id,
            courseOfferingId: program.courseOfferingId,
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
          data: program.classSubjects.map((subject) => ({
            enrollmentId: enrollment.id,
            courseOfferingId: program.courseOfferingId,
            courseOfferingSubjectId: subject.courseOfferingSubjectId,
            startsOn,
            endsOn,
            attendanceManaged: true,
            gradeManaged: true,
            reason,
          })),
        });

        createdIds.push(enrollment.id);
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'REGULAR_ENROLLMENT_CREATED',
          resourceType: 'ENROLLMENT',
          resourceId: createdIds[0],
          afterData: {
            studentId: student.id,
            classId,
            enrollmentIds: createdIds,
            courseOfferingIds: classItem.programs.map(
              (program) => program.courseOfferingId,
            ),
            type: EnrollmentType.REGULAR,
            status,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn ?? null,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return createdIds;
    });

    return this.findMany(enrollmentIds);
  }

  /** 과목 단위 보충·보강 참여 등록 */
  async createSubjectEnrollment(
    classId: string,
    dto: CreateSubjectEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse> {
    if (
      dto.type !== EnrollmentType.SUPPLEMENT &&
      dto.type !== EnrollmentType.MAKEUP
    ) {
      throw new BadRequestException(
        '과목 단위 참여는 보충 또는 보강 유형만 가능합니다.',
      );
    }

    const startsOn = this.toDate(dto.startsOn);
    const endsOn = this.toDate(dto.endsOn);
    const reason = dto.reason.trim();
    const attendanceManaged = dto.attendanceManaged ?? true;
    const gradeManaged = dto.gradeManaged ?? false;

    if (startsOn > endsOn) {
      throw new BadRequestException(
        '과목 참여 종료일은 시작일보다 빠를 수 없습니다.',
      );
    }

    const enrollmentId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM classes
        WHERE id = ${classId}::uuid
        FOR UPDATE
      `;

      const sourceEnrollment = await tx.enrollment.findFirst({
        where: {
          id: dto.sourceEnrollmentId,
          type: EnrollmentType.REGULAR,
          status: { in: ACTIVE_STATUSES },
        },
        include: { student: { select: { status: true } } },
      });

      if (!sourceEnrollment) {
        throw new NotFoundException(
          '학생의 활성 기본 수강 등록을 찾을 수 없습니다.',
        );
      }
      if (sourceEnrollment.student.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 학생만 과목 단위 참여가 가능합니다.',
        );
      }
      if (sourceEnrollment.classId === classId) {
        throw new ConflictException(
          '기본 수강 중인 반에는 별도의 보충·보강 과목을 등록할 수 없습니다.',
        );
      }
      if (
        startsOn < sourceEnrollment.startsOn ||
        (sourceEnrollment.endsOn && endsOn > sourceEnrollment.endsOn)
      ) {
        throw new BadRequestException(
          '보충·보강 기간은 기본 수강 기간 안에 있어야 합니다.',
        );
      }

      const targetClass = await tx.class.findUnique({
        where: { id: classId },
        include: {
          programs: {
            where: { courseOfferingId: sourceEnrollment.courseOfferingId },
            include: {
              classSubjects: {
                where: {
                  courseOfferingSubjectId: dto.courseOfferingSubjectId,
                  active: true,
                },
                select: { id: true },
              },
            },
          },
        },
      });

      if (!targetClass) {
        throw new NotFoundException('참여할 반을 찾을 수 없습니다.');
      }
      if (targetClass.archivedAt) {
        throw new ConflictException(
          '보관된 반에는 과목 참여를 등록할 수 없습니다.',
        );
      }
      if (targetClass.programs.length === 0) {
        throw new ConflictException(
          '대상 반은 학생의 기본 수강 교육과정을 운영하지 않습니다.',
        );
      }
      if (targetClass.programs[0].classSubjects.length === 0) {
        throw new NotFoundException(
          '대상 반에서 운영하는 과목을 찾을 수 없습니다.',
        );
      }
      if (startsOn < targetClass.startDate || endsOn > targetClass.endDate) {
        throw new BadRequestException(
          '과목 참여 기간은 대상 반 운영 기간 안에 있어야 합니다.',
        );
      }

      let targetEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId: sourceEnrollment.studentId,
          courseOfferingId: sourceEnrollment.courseOfferingId,
          classId,
          type: dto.type,
          status: { in: ACTIVE_STATUSES },
        },
        include: { subjects: { select: { courseOfferingSubjectId: true } } },
      });

      if (
        targetEnrollment?.subjects.some(
          (subject) =>
            subject.courseOfferingSubjectId === dto.courseOfferingSubjectId,
        )
      ) {
        throw new ConflictException(
          '이미 해당 과목에 보충·보강 등록되어 있습니다.',
        );
      }

      if (!targetEnrollment) {
        await this.assertCapacity(tx, targetClass.id, targetClass.capacity, [
          sourceEnrollment.studentId,
        ]);

        targetEnrollment = await tx.enrollment.create({
          data: {
            studentId: sourceEnrollment.studentId,
            courseOfferingId: sourceEnrollment.courseOfferingId,
            classId,
            type: dto.type,
            status: this.getInitialStatus(startsOn, endsOn),
            startsOn,
            endsOn,
            reason,
            attendanceManaged,
            gradeManaged,
            assignedById: actor.id,
          },
          include: { subjects: { select: { courseOfferingSubjectId: true } } },
        });
      } else {
        const mergedStartsOn =
          startsOn < targetEnrollment.startsOn
            ? startsOn
            : targetEnrollment.startsOn;
        const mergedEndsOn =
          !targetEnrollment.endsOn || endsOn > targetEnrollment.endsOn
            ? endsOn
            : targetEnrollment.endsOn;

        targetEnrollment = await tx.enrollment.update({
          where: { id: targetEnrollment.id },
          data: {
            startsOn: mergedStartsOn,
            endsOn: mergedEndsOn,
            status: this.getInitialStatus(mergedStartsOn, mergedEndsOn),
            attendanceManaged:
              targetEnrollment.attendanceManaged || attendanceManaged,
            gradeManaged: targetEnrollment.gradeManaged || gradeManaged,
          },
          include: { subjects: { select: { courseOfferingSubjectId: true } } },
        });
      }

      const enrollmentSubject = await tx.enrollmentSubject.create({
        data: {
          enrollmentId: targetEnrollment.id,
          courseOfferingId: sourceEnrollment.courseOfferingId,
          courseOfferingSubjectId: dto.courseOfferingSubjectId,
          startsOn,
          endsOn,
          attendanceManaged,
          gradeManaged,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ENROLLMENT_SUBJECT_PARTICIPATION_ADDED',
          resourceType: 'ENROLLMENT_SUBJECT',
          resourceId: enrollmentSubject.id,
          afterData: {
            enrollmentId: targetEnrollment.id,
            sourceEnrollmentId: sourceEnrollment.id,
            studentId: sourceEnrollment.studentId,
            courseOfferingId: sourceEnrollment.courseOfferingId,
            classId,
            courseOfferingSubjectId: dto.courseOfferingSubjectId,
            type: dto.type,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn,
            attendanceManaged,
            gradeManaged,
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return targetEnrollment.id;
    });

    return this.findOne(enrollmentId);
  }

  /** 중도 퇴원: 같은 반·같은 유형의 모든 교육과정 등록을 함께 종료한다. */
  async withdraw(
    classId: string,
    enrollmentId: string,
    dto: WithdrawEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse[]> {
    const reason = dto.reason.trim();
    const effectiveOn = this.toDate(dto.effectiveOn);

    if (effectiveOn > this.getToday()) {
      throw new BadRequestException('중도 퇴원일은 오늘 이후일 수 없습니다.');
    }

    const affectedIds = await this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findFirst({
        where: { id: enrollmentId, classId },
      });

      if (!enrollment) {
        throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
      }

      const siblings = await tx.enrollment.findMany({
        where: {
          classId,
          studentId: enrollment.studentId,
          type: enrollment.type,
          status: { in: ACTIVE_STATUSES },
        },
      });

      if (siblings.length === 0) {
        throw new ConflictException(
          '이미 종료되었거나 중도 퇴원 처리된 수강생입니다.',
        );
      }

      const tooEarly = siblings.find((item) => effectiveOn < item.startsOn);
      if (tooEarly) {
        throw new BadRequestException(
          '중도 퇴원일은 수강 시작일보다 빠를 수 없습니다.',
        );
      }

      const ids = siblings.map((item) => item.id);

      await tx.enrollmentSubject.updateMany({
        where: { enrollmentId: { in: ids } },
        data: { endsOn: effectiveOn },
      });

      await tx.enrollment.updateMany({
        where: { id: { in: ids } },
        data: {
          status: EnrollmentStatus.CANCELED,
          endsOn: effectiveOn,
          reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ENROLLMENT_WITHDRAWN',
          resourceType: 'ENROLLMENT',
          resourceId: enrollment.id,
          afterData: {
            enrollmentIds: ids,
            studentId: enrollment.studentId,
            classId,
            status: EnrollmentStatus.CANCELED,
            effectiveOn: dto.effectiveOn,
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return ids;
    });

    return this.findMany(affectedIds);
  }

  /** 반 이동: 기존 반의 기본 수강을 종료하고 대상 반의 교육과정별로 새로 등록한다. */
  async transfer(
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
        FROM classes
        WHERE id IN (${classId}::uuid, ${dto.targetClassId}::uuid)
        FOR UPDATE
      `;

      const enrollment = await tx.enrollment.findFirst({
        where: { id: enrollmentId, classId },
      });

      if (!enrollment) {
        throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
      }
      if (enrollment.type !== EnrollmentType.REGULAR) {
        throw new ConflictException(
          '기본 수강 등록만 다른 반으로 이동할 수 있습니다.',
        );
      }

      const sourceEnrollments = await tx.enrollment.findMany({
        where: {
          classId,
          studentId: enrollment.studentId,
          type: EnrollmentType.REGULAR,
          status: { in: ACTIVE_STATUSES },
        },
      });

      if (sourceEnrollments.length === 0) {
        throw new ConflictException(
          '예정 또는 수강 중 상태만 반 이동할 수 있습니다.',
        );
      }

      const invalidStart = sourceEnrollments.find(
        (item) => transferOn < item.startsOn,
      );
      if (invalidStart) {
        throw new BadRequestException(
          '반 이동일은 기존 수강 시작일보다 빠를 수 없습니다.',
        );
      }
      const invalidEnd = sourceEnrollments.find(
        (item) => item.endsOn && transferOn > item.endsOn,
      );
      if (invalidEnd) {
        throw new BadRequestException(
          '반 이동일은 기존 수강 종료일보다 늦을 수 없습니다.',
        );
      }

      const targetClass = await tx.class.findUnique({
        where: { id: dto.targetClassId },
        include: {
          programs: {
            include: {
              courseOffering: { select: { id: true, name: true } },
              classSubjects: {
                where: { active: true },
                select: { courseOfferingSubjectId: true },
              },
            },
          },
        },
      });

      if (!targetClass) {
        throw new NotFoundException('이동할 대상 반을 찾을 수 없습니다.');
      }
      if (targetClass.archivedAt) {
        throw new ConflictException('보관된 반으로 이동할 수 없습니다.');
      }
      if (targetClass.programs.length === 0) {
        throw new ConflictException(
          '교육과정이 없는 반으로 이동할 수 없습니다.',
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

      const emptyProgram = targetClass.programs.find(
        (program) => program.classSubjects.length === 0,
      );
      if (emptyProgram) {
        throw new ConflictException(
          `운영 과목이 없는 교육과정이 있습니다: ${emptyProgram.courseOffering.name}`,
        );
      }

      const sourceIds = sourceEnrollments.map((item) => item.id);

      // 이동 후에도 같은 교육과정의 활성 기본 반이 둘이 되지 않아야 한다.
      const conflicting = await tx.enrollment.findMany({
        where: {
          id: { notIn: sourceIds },
          studentId: enrollment.studentId,
          courseOfferingId: {
            in: targetClass.programs.map((program) => program.courseOfferingId),
          },
          type: EnrollmentType.REGULAR,
          status: { in: ACTIVE_STATUSES },
        },
        include: { courseOffering: { select: { name: true } } },
      });

      if (conflicting.length > 0) {
        throw new ConflictException(
          `이 학생에게 다른 활성 기본 수강 등록이 있습니다: ${conflicting
            .map((item) => item.courseOffering.name)
            .join(', ')}`,
        );
      }

      await this.assertCapacity(tx, targetClass.id, targetClass.capacity, [
        enrollment.studentId,
      ]);

      // 이동일 하루 전까지를 기존 수강 기간으로 마감해 기간이 겹치지 않게 한다.
      const previousEndsOn = this.addDays(transferOn, -1);

      for (const source of sourceEnrollments) {
        const previousStatus =
          source.status === EnrollmentStatus.SCHEDULED
            ? EnrollmentStatus.CANCELED
            : EnrollmentStatus.COMPLETED;
        const closedEndsOn =
          previousEndsOn < source.startsOn ? source.startsOn : previousEndsOn;

        await tx.enrollment.update({
          where: { id: source.id },
          data: { status: previousStatus, endsOn: closedEndsOn },
        });
        await tx.enrollmentSubject.updateMany({
          where: { enrollmentId: source.id },
          data: { endsOn: closedEndsOn },
        });
      }

      const referenceEndsOn =
        sourceEnrollments[0].endsOn ?? targetClass.endDate;
      const newEndsOn =
        referenceEndsOn > targetClass.endDate
          ? targetClass.endDate
          : referenceEndsOn;

      if (newEndsOn < transferOn) {
        throw new BadRequestException(
          '대상 반에서 유효한 수강 기간을 만들 수 없습니다.',
        );
      }

      const newStatus = this.getInitialStatus(transferOn, newEndsOn);
      const newIds: string[] = [];

      for (const program of targetClass.programs) {
        const created = await tx.enrollment.create({
          data: {
            studentId: enrollment.studentId,
            courseOfferingId: program.courseOfferingId,
            classId: targetClass.id,
            type: EnrollmentType.REGULAR,
            status: newStatus,
            startsOn: transferOn,
            endsOn: newEndsOn,
            reason,
            attendanceManaged: enrollment.attendanceManaged,
            gradeManaged: enrollment.gradeManaged,
            assignedById: actor.id,
          },
        });

        await tx.enrollmentSubject.createMany({
          data: program.classSubjects.map((subject) => ({
            enrollmentId: created.id,
            courseOfferingId: program.courseOfferingId,
            courseOfferingSubjectId: subject.courseOfferingSubjectId,
            startsOn: transferOn,
            endsOn: newEndsOn,
            attendanceManaged: enrollment.attendanceManaged,
            gradeManaged: enrollment.gradeManaged,
            reason,
          })),
        });

        newIds.push(created.id);
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ENROLLMENT_CLASS_TRANSFERRED',
          resourceType: 'ENROLLMENT',
          resourceId: enrollment.id,
          beforeData: { classId, enrollmentIds: sourceIds },
          afterData: {
            targetClassId: targetClass.id,
            enrollmentIds: newIds,
            transferOn: dto.transferOn,
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return { sourceIds, newIds };
    });

    const [previousEnrollments, newEnrollments] = await Promise.all([
      this.findMany(result.sourceIds),
      this.findMany(result.newIds),
    ]);

    return { previousEnrollments, newEnrollments };
  }

  /** 반 정원은 기본 수강 학생 수(중복 제외) 기준으로 확인한다. */
  private async assertCapacity(
    tx: Prisma.TransactionClient,
    classId: string,
    capacity: number,
    additionalStudentIds: string[] = [],
  ): Promise<void> {
    const enrolled = await tx.enrollment.findMany({
      where: {
        classId,
        type: EnrollmentType.REGULAR,
        status: { in: ACTIVE_STATUSES },
      },
      distinct: ['studentId'],
      select: { studentId: true },
    });

    const studentIds = new Set(enrolled.map((item) => item.studentId));
    for (const studentId of additionalStudentIds) {
      studentIds.add(studentId);
    }

    if (studentIds.size > capacity) {
      throw new ConflictException('반 정원을 초과할 수 없습니다.');
    }
  }

  private keywordFilter(keyword?: string): Prisma.EnrollmentWhereInput {
    const normalized = keyword?.trim();
    if (!normalized) {
      return {};
    }

    return {
      student: {
        OR: [
          { name: { contains: normalized, mode: 'insensitive' } },
          { loginId: { contains: normalized, mode: 'insensitive' } },
          { phone: { contains: normalized } },
        ],
      },
    };
  }

  private toPage(
    items: EnrollmentWithRelations[],
    total: number,
    query: EnrollmentQueryDto,
  ): EnrollmentPageResponse {
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

  private async findOne(enrollmentId: string): Promise<EnrollmentResponse> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: ENROLLMENT_INCLUDE,
    });

    if (!enrollment) {
      throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
    }

    return this.toResponse(enrollment);
  }

  private async findMany(
    enrollmentIds: string[],
  ): Promise<EnrollmentResponse[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { id: { in: enrollmentIds } },
      include: ENROLLMENT_INCLUDE,
      orderBy: { courseOffering: { name: 'asc' } },
    });

    return enrollments.map((enrollment) => this.toResponse(enrollment));
  }

  private async assertClassExists(classId: string): Promise<void> {
    const exists = await this.prisma.class.count({ where: { id: classId } });

    if (exists === 0) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
  }

  private async synchronizeEnrollmentStatuses(classId: string): Promise<void> {
    const today = this.getToday();

    await this.prisma.$transaction(async (tx) => {
      await tx.enrollment.updateMany({
        where: {
          classId,
          status: EnrollmentStatus.SCHEDULED,
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
        data: { status: EnrollmentStatus.ACTIVE },
      });

      await tx.enrollment.updateMany({
        where: {
          classId,
          status: { in: ACTIVE_STATUSES },
          endsOn: { lt: today },
        },
        data: { status: EnrollmentStatus.COMPLETED },
      });
    });
  }

  private getToday(): Date {
    return this.toDate(todaySeoulDateString());
  }

  private addDays(value: Date, days: number): Date {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);

    return result;
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
      courseOfferingName: item.courseOffering.name,
      classId: item.classId,
      type: item.type,
      status: item.status,
      startsOn: item.startsOn.toISOString().slice(0, 10),
      endsOn: item.endsOn?.toISOString().slice(0, 10) ?? null,
      reason: item.reason,
      attendanceManaged: item.attendanceManaged,
      gradeManaged: item.gradeManaged,
      subjects: [...item.subjects]
        .map((subject) => ({
          id: subject.id,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          subjectId: subject.courseOfferingSubject.subject.id,
          subjectName: subject.courseOfferingSubject.subject.name,
          startsOn: subject.startsOn.toISOString().slice(0, 10),
          endsOn: subject.endsOn?.toISOString().slice(0, 10) ?? null,
        }))
        .sort((left, right) =>
          left.subjectName.localeCompare(right.subjectName),
        ),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
