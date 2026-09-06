import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { todaySeoulDateOnly } from '../common/seoul-date';
import {
  AttemptStatus,
  EnrollmentStatus,
  EnrollmentType,
  ExamStatus,
  PassStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AddExamTargetDto } from './dto/add-exam-target.dto';
import { ExamAccessService } from './exam-access.service';

export type ExamTargetResponse = {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  enrollmentId: string;
  status: AttemptStatus;
  startedAt: string | null;
};

export type ExamTargetListResponse = {
  examId: string;
  locked: boolean;
  lockedAt: string | null;
  targets: ExamTargetResponse[];
};

/** 명단 재생성·수동 편집에 필요한 시험의 최소 정보다. */
type ExamForTargets = {
  id: string;
  status: ExamStatus;
  scope: string;
  courseOfferingId: string;
  targetLockedAt: Date | null;
  courseOfferingSubjectIds: string[];
  classTargetIds: string[];
};

/** 후보 학생 한 명이 응시하게 될 반과 수강 등록이다. */
type Candidate = { enrollmentId: string; classId: string };

/**
 * 시험 대상 학생 명단(`exam_attempts` = `NOT_STARTED`)을 사전 생성하고, 시험 시작
 * 전까지 편집하며, 잠근다(기획안 §14.1·§15.1·D-30).
 *
 * 후보 판정은 담당 강사 배정이 아니라 학생의 성적 관리 자격(`grade_managed`)을
 * 기준으로 한다. 과목형 시험은 그 과목, 종합형 시험은 시험의 모든 과목에 대해
 * 같은 수강 등록 안에서 자격이 있어야 한다. 한 학생에게 후보 수강이 여러 건이면
 * 대상 반의 활성 `REGULAR` 수강 → 더 최근 `starts_on` → UUID 순으로 한 건을
 * 골라 중복 응시 생성을 막는다.
 */
@Injectable()
export class ExamTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
  ) {}

  async list(
    examId: string,
    actor: AuthenticatedUser,
  ): Promise<ExamTargetListResponse> {
    const exam = await this.loadExam(examId, actor);

    const attempts = await this.prisma.examAttempt.findMany({
      where: { examId },
      orderBy: [{ classId: 'asc' }, { studentId: 'asc' }],
      select: {
        studentId: true,
        classId: true,
        enrollmentId: true,
        status: true,
        startedAt: true,
        student: { select: { name: true } },
        class: { select: { name: true } },
      },
    });

    return {
      examId,
      locked: exam.targetLockedAt !== null,
      lockedAt: exam.targetLockedAt?.toISOString() ?? null,
      targets: attempts.map((attempt) => ({
        studentId: attempt.studentId,
        studentName: attempt.student.name,
        classId: attempt.classId,
        className: attempt.class.name,
        enrollmentId: attempt.enrollmentId,
        status: attempt.status,
        startedAt: attempt.startedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * 자동 후보로 대상 명단을 다시 만든다.
   *
   * 아직 시작하지 않은(`NOT_STARTED`) 응시 기록 중 더 이상 후보가 아닌 학생을
   * 지우고, 새 후보를 추가한다. 이미 시작한 응시 기록은 건드리지 않는다.
   */
  async rebuild(
    examId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTargetListResponse> {
    const exam = await this.loadExam(examId, actor);
    this.assertEditable(exam);

    const candidates = await this.findCandidates(exam);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.examAttempt.findMany({
        where: { examId },
        select: { studentId: true, status: true },
      });
      const existingStudentIds = new Set(existing.map((row) => row.studentId));

      const removable = existing
        .filter(
          (row) =>
            row.status === AttemptStatus.NOT_STARTED &&
            !candidates.has(row.studentId),
        )
        .map((row) => row.studentId);
      if (removable.length > 0) {
        await tx.examAttempt.deleteMany({
          where: {
            examId,
            studentId: { in: removable },
            status: AttemptStatus.NOT_STARTED,
          },
        });
      }

      const toAdd = [...candidates.entries()].filter(
        ([studentId]) => !existingStudentIds.has(studentId),
      );
      if (toAdd.length > 0) {
        await tx.examAttempt.createMany({
          data: toAdd.map(([studentId, candidate]) => ({
            examId,
            courseOfferingId: exam.courseOfferingId,
            classId: candidate.classId,
            studentId,
            enrollmentId: candidate.enrollmentId,
            status: AttemptStatus.NOT_STARTED,
            writtenResult: PassStatus.PENDING,
            practicalResult: PassStatus.PENDING,
            finalResult: PassStatus.PENDING,
            version: 0,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TARGETS_REBUILT',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: {
            added: toAdd.length,
            removed: removable.length,
            total: candidates.size,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.list(examId, actor);
  }

  async addManual(
    examId: string,
    dto: AddExamTargetDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTargetListResponse> {
    const exam = await this.loadExam(examId, actor);
    this.assertEditable(exam);

    const candidates = await this.findCandidates(exam, dto.studentId);
    const candidate = candidates.get(dto.studentId);
    if (!candidate) {
      throw new BadRequestException(
        '이 학생은 시험의 모든 과목에 대한 성적 관리 자격이 없어 추가할 수 없습니다.',
      );
    }

    const already = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: dto.studentId } },
      select: { studentId: true },
    });
    if (already) {
      throw new ConflictException('이미 대상 명단에 있는 학생입니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examAttempt.create({
        data: {
          examId,
          courseOfferingId: exam.courseOfferingId,
          classId: candidate.classId,
          studentId: dto.studentId,
          enrollmentId: candidate.enrollmentId,
          status: AttemptStatus.NOT_STARTED,
          writtenResult: PassStatus.PENDING,
          practicalResult: PassStatus.PENDING,
          finalResult: PassStatus.PENDING,
          version: 0,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TARGET_ADDED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { studentId: dto.studentId },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.list(examId, actor);
  }

  async remove(
    examId: string,
    studentId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTargetListResponse> {
    const exam = await this.loadExam(examId, actor);
    this.assertEditable(exam);

    const attempt = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId } },
      select: { status: true },
    });
    if (!attempt) {
      throw new NotFoundException('대상 명단에 없는 학생입니다.');
    }
    if (attempt.status !== AttemptStatus.NOT_STARTED) {
      throw new ConflictException(
        '이미 응시를 시작한 학생은 명단에서 제외할 수 없습니다.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examAttempt.delete({
        where: { examId_studentId: { examId, studentId } },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TARGET_REMOVED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { studentId },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.list(examId, actor);
  }

  async lock(
    examId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTargetListResponse> {
    const exam = await this.loadExam(examId, actor);
    if (exam.targetLockedAt !== null) {
      throw new ConflictException('이미 잠긴 대상 명단입니다.');
    }
    if (
      exam.status === ExamStatus.CANCELED ||
      exam.status === ExamStatus.COMPLETED
    ) {
      throw new ConflictException('종결된 시험의 명단은 잠글 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: { targetLockedAt: new Date(), targetLockedById: actor.id },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TARGETS_LOCKED',
          resourceType: 'EXAM',
          resourceId: examId,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.list(examId, actor);
  }

  /**
   * 시험의 자동 대상 후보를 학생별로 한 명씩 구한다.
   *
   * 성적 관리 자격(`grade_managed = true`)이 있는 활성 `enrollment_subjects`를
   * 모아, 시험의 모든 과목(`course_offering_subject_id`)을 한 수강 등록이 모두
   * 덮을 때만 후보로 삼는다. 후보 수강이 여러 건이면 §15.1 순서로 한 건을 고른다.
   */
  private async findCandidates(
    exam: ExamForTargets,
    studentId?: string,
  ): Promise<Map<string, Candidate>> {
    const cosIds = exam.courseOfferingSubjectIds;
    if (cosIds.length === 0 || exam.classTargetIds.length === 0) {
      return new Map();
    }

    const today = todaySeoulDateOnly();
    const links = await this.prisma.enrollmentSubject.findMany({
      where: {
        courseOfferingSubjectId: { in: cosIds },
        gradeManaged: true,
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        enrollment: {
          status: EnrollmentStatus.ACTIVE,
          courseOfferingId: exam.courseOfferingId,
          classId: { in: exam.classTargetIds },
          ...(studentId ? { studentId } : {}),
        },
      },
      select: {
        courseOfferingSubjectId: true,
        enrollment: {
          select: {
            id: true,
            studentId: true,
            classId: true,
            type: true,
            startsOn: true,
          },
        },
      },
    });

    // 수강 등록별로 어떤 과목을 덮는지 모은다.
    const byEnrollment = new Map<
      string,
      {
        studentId: string;
        classId: string;
        type: EnrollmentType;
        startsOn: Date;
        covered: Set<string>;
      }
    >();
    for (const link of links) {
      const enrollment = link.enrollment;
      let entry = byEnrollment.get(enrollment.id);
      if (!entry) {
        entry = {
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          type: enrollment.type,
          startsOn: enrollment.startsOn,
          covered: new Set(),
        };
        byEnrollment.set(enrollment.id, entry);
      }
      entry.covered.add(link.courseOfferingSubjectId);
    }

    // 시험의 모든 과목을 덮는 수강 등록만 남기고, 학생별로 한 건을 고른다.
    const requiredCount = cosIds.length;
    const best = new Map<
      string,
      Candidate & { type: EnrollmentType; startsOn: Date }
    >();
    for (const [enrollmentId, entry] of byEnrollment) {
      if (entry.covered.size !== requiredCount) {
        continue;
      }

      const current = best.get(entry.studentId);
      if (!current || this.prefer(entry, current, enrollmentId)) {
        best.set(entry.studentId, {
          enrollmentId,
          classId: entry.classId,
          type: entry.type,
          startsOn: entry.startsOn,
        });
      }
    }

    const result = new Map<string, Candidate>();
    for (const [student, candidate] of best) {
      result.set(student, {
        enrollmentId: candidate.enrollmentId,
        classId: candidate.classId,
      });
    }
    return result;
  }

  /** 후보 우선순위: 활성 REGULAR → 더 최근 `starts_on` → 작은 UUID. */
  private prefer(
    challenger: { type: EnrollmentType; startsOn: Date },
    incumbent: { type: EnrollmentType; startsOn: Date; enrollmentId: string },
    challengerId: string,
  ): boolean {
    const challengerRegular = challenger.type === EnrollmentType.REGULAR;
    const incumbentRegular = incumbent.type === EnrollmentType.REGULAR;
    if (challengerRegular !== incumbentRegular) {
      return challengerRegular;
    }

    if (challenger.startsOn.getTime() !== incumbent.startsOn.getTime()) {
      return challenger.startsOn.getTime() > incumbent.startsOn.getTime();
    }

    return challengerId < incumbent.enrollmentId;
  }

  private assertEditable(exam: ExamForTargets): void {
    if (exam.targetLockedAt !== null) {
      throw new ConflictException(
        '대상 명단이 잠겨 있어 추가·제외할 수 없습니다.',
      );
    }
    if (
      exam.status !== ExamStatus.DRAFT &&
      exam.status !== ExamStatus.SCHEDULED
    ) {
      throw new ConflictException(
        '초안 또는 예약 상태의 시험만 대상 명단을 편집할 수 있습니다.',
      );
    }
  }

  private async loadExam(
    examId: string,
    actor: AuthenticatedUser,
  ): Promise<ExamForTargets> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        status: true,
        scope: true,
        courseOfferingId: true,
        targetLockedAt: true,
        createdById: true,
        courseOffering: { select: { instructorId: true } },
        subjects: {
          select: {
            courseOfferingSubjectId: true,
            courseOfferingSubject: { select: { subjectId: true } },
          },
        },
        classTargets: { select: { classId: true } },
      },
    });
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canManageExam(actor, {
      courseOfferingInstructorId: exam.courseOffering.instructorId,
      createdById: exam.createdById,
      subjectIds: exam.subjects.map(
        (link) => link.courseOfferingSubject.subjectId,
      ),
    });
    if (!canAccess) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    return {
      id: exam.id,
      status: exam.status,
      scope: exam.scope,
      courseOfferingId: exam.courseOfferingId,
      targetLockedAt: exam.targetLockedAt,
      courseOfferingSubjectIds: exam.subjects.map(
        (link) => link.courseOfferingSubjectId,
      ),
      classTargetIds: exam.classTargets.map((target) => target.classId),
    };
  }
}
