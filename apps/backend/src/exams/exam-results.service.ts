import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AttemptStatus,
  ExamStatus,
  PassStatus,
  QuestionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReviseExamResultDto } from './dto/revise-exam-result.dto';
import { ExamAccessService } from './exam-access.service';

/**
 * 강사의 결과 정정 허용 기간(일)이다.
 *
 * 기획안 시스템 설정 `exam.result_revision_days_for_instructor`와 같은 값이다.
 * 실장·원장·관리자는 기간 제한이 없다.
 */
const INSTRUCTOR_REVISION_DAYS = 7;

const DAY_MS = 86_400_000;

/** 응시 기록의 결과 필드 스냅샷이다. 정정 이력의 before/after 로 저장한다. */
type ResultSnapshot = {
  writtenScore: number | null;
  writtenResult: PassStatus;
  practicalScore: number | null;
  practicalResult: PassStatus;
  finalResult: PassStatus;
};

/** 학생에게 공개하는 결과다. 정답·해설·본인 답안은 절대 담지 않는다. */
export type MyExamResultResponse = {
  examId: string;
  title: string;
  published: boolean;
  publishedAt: string | null;
  revisedAt: string | null;
  attemptStatus: AttemptStatus;
  writtenScore: number | null;
  finalResult: PassStatus;
  writtenFeedback: string | null;
  parts: Array<{
    type: string;
    score: number | null;
    passScore: number;
    result: PassStatus;
  }>;
};

/** 강사·실장 이상만 보는 문항별 상세다. */
export type AttemptDetailResponse = {
  examId: string;
  attemptId: string;
  studentId: string;
  status: AttemptStatus;
  writtenScore: number | null;
  writtenResult: PassStatus;
  finalResult: PassStatus;
  questions: Array<{
    examQuestionId: string;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    score: number;
    awardedScore: number | null;
    isCorrect: boolean | null;
    subjectiveText: string | null;
    selectedOptionIds: string[];
    options: Array<{ id: string; content: string; isCorrect: boolean }>;
    acceptedAnswers: string[];
  }>;
  revisions: Array<{
    previousResult: unknown;
    newResult: unknown;
    reason: string;
    changedById: string | null;
    changedAt: string;
  }>;
};

@Injectable()
export class ExamResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
  ) {}

  /** 담당 강사·실장 이상이 전원 채점 상태를 확인한다(기획안 §14.1·D-27). */
  async review(
    examId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{ reviewedAt: string }> {
    const exam = await this.loadManageableExam(examId, actor);
    if (
      exam.status !== ExamStatus.CLOSED &&
      exam.status !== ExamStatus.GRADING
    ) {
      throw new ConflictException(
        '응시가 종료되고 채점이 끝난 시험만 결과를 확인할 수 있습니다.',
      );
    }
    await this.assertAllAttemptsResolved(examId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: { resultsReviewedAt: now, resultsReviewedById: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_RESULTS_REVIEWED',
          resourceType: 'EXAM',
          resourceId: examId,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return { reviewedAt: now.toISOString() };
  }

  /** 확인이 끝난 시험 결과를 학생에게 수동 공개하고 시험을 완료한다(D-27). */
  async publish(
    examId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{ publishedAt: string }> {
    const exam = await this.loadManageableExam(examId, actor);
    if (exam.resultsPublishedAt) {
      throw new ConflictException('이미 공개된 시험입니다.');
    }
    if (!exam.resultsReviewedAt) {
      throw new ConflictException('먼저 결과 확인을 완료해야 합니다.');
    }
    await this.assertAllAttemptsResolved(examId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id: examId },
        data: {
          resultsPublishedAt: now,
          resultsPublishedById: actor.id,
          status: ExamStatus.COMPLETED,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_RESULTS_PUBLISHED',
          resourceType: 'EXAM',
          resourceId: examId,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return { publishedAt: now.toISOString() };
  }

  /**
   * 응시 기록의 결과를 정정한다(기획안 §15.6·D-28).
   *
   * 강사는 시험 종료 후 7일 이내, 담당 교육과정만. 실장·원장·관리자는 기간 제한
   * 없음. 전후 값·사유·정정자·시각을 수정 불가능한 이력으로 남기고, 공개 상태는
   * 유지한 채 변경을 즉시 반영한다.
   */
  async revise(
    examId: string,
    attemptId: string,
    dto: ReviseExamResultDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<AttemptDetailResponse> {
    const exam = await this.loadManageableExam(examId, actor);
    if (exam.status === ExamStatus.CANCELED) {
      throw new ConflictException('취소된 시험의 결과는 정정할 수 없습니다.');
    }

    if (!this.access.isPrivileged(actor.role)) {
      const limit = new Date(
        exam.closesAt.getTime() + INSTRUCTOR_REVISION_DAYS * DAY_MS,
      );
      if (new Date() > limit) {
        throw new ForbiddenException(
          `강사는 시험 종료 후 ${INSTRUCTOR_REVISION_DAYS}일 이내에만 결과를 정정할 수 있습니다.`,
        );
      }
    }

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      select: {
        id: true,
        status: true,
        version: true,
        writtenScore: true,
        writtenResult: true,
        practicalScore: true,
        practicalResult: true,
        finalResult: true,
        partSubmissions: {
          where: { examPart: { type: 'WRITTEN' } },
          select: {
            id: true,
            examPart: { select: { totalScore: true } },
          },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('응시 기록을 찾을 수 없습니다.');
    }

    const writtenSubmission = attempt.partSubmissions[0] ?? null;
    if (
      dto.writtenScore !== undefined &&
      writtenSubmission &&
      (dto.writtenScore < 0 ||
        dto.writtenScore > Number(writtenSubmission.examPart.totalScore))
    ) {
      throw new BadRequestException(
        '정정 점수는 0점 이상 필기 파트 총점 이하여야 합니다.',
      );
    }
    if (
      attempt.status !== AttemptStatus.GRADED &&
      attempt.status !== AttemptStatus.NOT_ATTENDED &&
      attempt.status !== AttemptStatus.INCOMPLETE
    ) {
      throw new ConflictException(
        '채점이 끝난 응시 기록만 정정할 수 있습니다.',
      );
    }

    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException('정정 사유가 필요합니다.');
    }

    const previous: ResultSnapshot = {
      writtenScore:
        attempt.writtenScore === null ? null : Number(attempt.writtenScore),
      writtenResult: attempt.writtenResult,
      practicalScore:
        attempt.practicalScore === null ? null : Number(attempt.practicalScore),
      practicalResult: attempt.practicalResult,
      finalResult: attempt.finalResult,
    };
    const next: ResultSnapshot = {
      ...previous,
      writtenScore: dto.writtenScore ?? previous.writtenScore,
      writtenResult: dto.writtenResult ?? previous.writtenResult,
      finalResult: dto.finalResult ?? previous.finalResult,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.examResultRevision.create({
        data: {
          examAttemptId: attempt.id,
          previousResult: previous,
          newResult: next,
          reason,
          changedById: actor.id,
        },
      });

      await tx.examAttempt.update({
        where: { id: attempt.id },
        data: {
          writtenScore: next.writtenScore,
          writtenResult: next.writtenResult,
          finalResult: next.finalResult,
          version: attempt.version + 1,
        },
      });

      // 정정 결과를 필기 파트 제출에도 반영해, 학생·강사 조회의 파트 점수와
      // 응시 기록 점수가 어긋나지 않게 한다(기획안 §15.6 "즉시 반영").
      if (writtenSubmission) {
        const submissionUpdate: {
          comment?: string | null;
          score?: number;
          result?: PassStatus;
        } = {};
        if (dto.writtenFeedback !== undefined) {
          submissionUpdate.comment = dto.writtenFeedback.trim() || null;
        }
        if (dto.writtenScore !== undefined) {
          submissionUpdate.score = next.writtenScore ?? undefined;
        }
        if (dto.writtenResult !== undefined) {
          submissionUpdate.result = next.writtenResult;
        }
        if (Object.keys(submissionUpdate).length > 0) {
          await tx.examPartSubmission.update({
            where: { id: writtenSubmission.id },
            data: submissionUpdate,
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_RESULT_REVISED',
          resourceType: 'EXAM',
          resourceId: examId,
          beforeData: previous,
          afterData: next,
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getAttemptDetail(examId, attemptId, actor);
  }

  /** 학생 본인의 결과. 공개 전에는 점수·합격 여부를 반환하지 않는다(§14.1·D-35). */
  async getMyResult(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<MyExamResultResponse> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: actor.id } },
      select: {
        status: true,
        writtenScore: true,
        finalResult: true,
        exam: {
          select: {
            id: true,
            title: true,
            resultsPublishedAt: true,
            parts: { select: { type: true, passScore: true } },
          },
        },
        partSubmissions: {
          select: {
            score: true,
            result: true,
            comment: true,
            examPart: { select: { type: true } },
          },
        },
        resultRevisions: {
          orderBy: { changedAt: 'desc' },
          take: 1,
          select: { changedAt: true },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('응시 대상 시험이 아닙니다.');
    }

    const publishedAt = attempt.exam.resultsPublishedAt;
    const base = {
      examId: attempt.exam.id,
      title: attempt.exam.title,
      attemptStatus: attempt.status,
    };

    if (!publishedAt) {
      return {
        ...base,
        published: false,
        publishedAt: null,
        revisedAt: null,
        writtenScore: null,
        finalResult: PassStatus.PENDING,
        writtenFeedback: null,
        parts: [],
      };
    }

    const latestRevision = attempt.resultRevisions[0]?.changedAt ?? null;
    const revisedAt =
      latestRevision && latestRevision > publishedAt
        ? latestRevision.toISOString()
        : null;
    const passScoreByType = new Map(
      attempt.exam.parts.map((part) => [part.type, Number(part.passScore)]),
    );
    const writtenSub = attempt.partSubmissions.find(
      (submission) => submission.examPart.type === 'WRITTEN',
    );

    return {
      ...base,
      published: true,
      publishedAt: publishedAt.toISOString(),
      revisedAt,
      writtenScore:
        attempt.writtenScore === null ? null : Number(attempt.writtenScore),
      finalResult: attempt.finalResult,
      writtenFeedback: writtenSub?.comment ?? null,
      parts: attempt.partSubmissions.map((submission) => ({
        type: submission.examPart.type,
        score: submission.score === null ? null : Number(submission.score),
        passScore: passScoreByType.get(submission.examPart.type) ?? 0,
        result: submission.result,
      })),
    };
  }

  /** 강사·실장 이상만: 문항별 정오답·정답·해설·본인 답안까지 포함한 상세다. */
  async getAttemptDetail(
    examId: string,
    attemptId: string,
    actor: AuthenticatedUser,
  ): Promise<AttemptDetailResponse> {
    await this.loadManageableExam(examId, actor);

    const attempt = await this.prisma.examAttempt.findFirst({
      where: { id: attemptId, examId },
      select: {
        id: true,
        studentId: true,
        status: true,
        writtenScore: true,
        writtenResult: true,
        finalResult: true,
        partSubmissions: {
          where: { examPart: { type: 'WRITTEN' } },
          select: {
            answers: {
              select: {
                examQuestionId: true,
                subjectiveText: true,
                isCorrect: true,
                awardedScore: true,
                selectedOptions: { select: { examQuestionOptionId: true } },
              },
            },
          },
        },
        resultRevisions: {
          orderBy: { changedAt: 'asc' },
          select: {
            previousResult: true,
            newResult: true,
            reason: true,
            changedById: true,
            changedAt: true,
          },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('응시 기록을 찾을 수 없습니다.');
    }

    const questions = await this.prisma.examQuestion.findMany({
      where: { exam: { id: examId }, examPart: { type: 'WRITTEN' } },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        type: true,
        prompt: true,
        explanation: true,
        score: true,
        options: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, content: true, isCorrect: true },
        },
        acceptedAnswers: { select: { answerText: true } },
      },
    });

    const answerByQuestion = new Map(
      attempt.partSubmissions
        .flatMap((submission) => submission.answers)
        .map((answer) => [answer.examQuestionId, answer]),
    );

    return {
      examId,
      attemptId: attempt.id,
      studentId: attempt.studentId,
      status: attempt.status,
      writtenScore:
        attempt.writtenScore === null ? null : Number(attempt.writtenScore),
      writtenResult: attempt.writtenResult,
      finalResult: attempt.finalResult,
      questions: questions.map((question) => {
        const answer = answerByQuestion.get(question.id) ?? null;
        return {
          examQuestionId: question.id,
          type: question.type,
          prompt: question.prompt,
          explanation: question.explanation,
          score: Number(question.score),
          awardedScore:
            answer?.awardedScore === undefined || answer?.awardedScore === null
              ? null
              : Number(answer.awardedScore),
          isCorrect: answer?.isCorrect ?? null,
          subjectiveText: answer?.subjectiveText ?? null,
          selectedOptionIds:
            answer?.selectedOptions.map((s) => s.examQuestionOptionId) ?? [],
          options: question.options.map((option) => ({
            id: option.id,
            content: option.content,
            isCorrect: option.isCorrect,
          })),
          acceptedAnswers: question.acceptedAnswers.map((a) => a.answerText),
        };
      }),
      revisions: attempt.resultRevisions.map((revision) => ({
        previousResult: revision.previousResult,
        newResult: revision.newResult,
        reason: revision.reason,
        changedById: revision.changedById,
        changedAt: revision.changedAt.toISOString(),
      })),
    };
  }

  private async assertAllAttemptsResolved(examId: string): Promise<void> {
    const pending = await this.prisma.examAttempt.count({
      where: {
        examId,
        status: {
          in: [
            AttemptStatus.NOT_STARTED,
            AttemptStatus.IN_PROGRESS,
            AttemptStatus.SUBMITTED,
            AttemptStatus.GRADING,
          ],
        },
      },
    });
    if (pending > 0) {
      throw new ConflictException(
        `아직 채점이 끝나지 않은 응시가 ${pending}건 있습니다.`,
      );
    }
  }

  private async loadManageableExam(
    examId: string,
    actor: AuthenticatedUser,
  ): Promise<{
    status: ExamStatus;
    closesAt: Date;
    resultsReviewedAt: Date | null;
    resultsPublishedAt: Date | null;
  }> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        status: true,
        closesAt: true,
        resultsReviewedAt: true,
        resultsPublishedAt: true,
        createdById: true,
        courseOffering: { select: { instructorId: true } },
        subjects: {
          select: { courseOfferingSubject: { select: { subjectId: true } } },
        },
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
      status: exam.status,
      closesAt: exam.closesAt,
      resultsReviewedAt: exam.resultsReviewedAt,
      resultsPublishedAt: exam.resultsPublishedAt,
    };
  }
}
