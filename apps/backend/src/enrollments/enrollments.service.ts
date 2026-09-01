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

/**
 * 저장하는 수강 상태는 수강 중과 수강 철회 둘뿐이다.
 * 반 운영이 끝났는지는 반 기간으로 계산해 화면에서 표시한다.
 */
const ACTIVE_STATUSES = [EnrollmentStatus.ACTIVE] as EnrollmentStatus[];

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    classId: string,
    query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    await this.assertClassExists(classId);

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

  /**
   * 반 배정: 반에 포함된 모든 교육과정에 대해 수강 등록을 생성한다.
   * 수강 기간은 반 운영 기간을 그대로 따르고, 상태는 항상 수강 중으로 시작한다.
   */
  async createRegular(
    classId: string,
    dto: CreateRegularEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse[]> {
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

      // 같은 교육과정을 동시에 두 반에서 수강할 수 없다.
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
          `이 학생은 다음 교육과정을 이미 수강 중입니다: ${duplicates
            .map((item) => item.courseOffering.name)
            .join(', ')}`,
        );
      }

      await this.assertCapacity(tx, classItem.id, classItem.capacity, [
        student.id,
      ]);

      const startsOn = classItem.startDate;
      const endsOn = classItem.endDate;
      const createdIds: string[] = [];

      for (const program of classItem.programs) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: student.id,
            courseOfferingId: program.courseOfferingId,
            classId,
            type: EnrollmentType.REGULAR,
            status: EnrollmentStatus.ACTIVE,
            startsOn,
            endsOn,
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
            startsOn: startsOn.toISOString().slice(0, 10),
            endsOn: endsOn.toISOString().slice(0, 10),
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
            status: this.assertNotEnded(endsOn),
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
            status: this.assertNotEnded(mergedEndsOn),
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

  private getToday(): Date {
    return this.toDate(todaySeoulDateString());
  }

  private addDays(value: Date, days: number): Date {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  /** 신규 등록은 언제나 수강 중으로 시작한다. */
  private assertNotEnded(endsOn: Date | null): EnrollmentStatus {
    if (endsOn && endsOn < this.getToday()) {
      throw new BadRequestException(
        '이미 종료된 기간으로 신규 수강 등록할 수 없습니다.',
      );
    }

    return EnrollmentStatus.ACTIVE;
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
