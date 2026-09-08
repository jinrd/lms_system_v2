import { Injectable } from '@nestjs/common';
import {
  matchesAcceptedAnswer,
  ANSWER_NORMALIZATION_VERSION,
} from '../common/answer-normalizer';
import type { Prisma } from '../generated/prisma/client';
import {
  AttemptStatus,
  ExamPartType,
  PassStatus,
  QuestionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** 소수 둘째 자리까지만 남긴다. Decimal(6,2) 합산의 부동소수 오차를 없앤다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  return b.every((value) => set.has(value));
}

/**
 * 필기 파트 제출을 자동 채점한다(기획안 §8.2·§8.5·D-23·D-24).
 *
 * - 객관식: 학생이 고른 보기 집합과 정답 보기 집합이 완전히 일치할 때만 배점
 *   전량을 주고, 아니면 0점이다. 부분 점수는 없다.
 * - 단답형: 저장 당시 동결된 `exam_answers.normalized_text`를 스냅샷된 허용 정답의
 *   정규화 값과 완전 일치 비교한다. 동결값이 없는 예전 답안만 문항의
 *   `normalization_version` 규칙으로 다시 정규화한다. 정규화 규칙이 나중에 바뀌어도
 *   이미 치른 시험을 재채점하면 같은 결과가 나오도록 하기 위함이다.
 *
 * 채점은 화면 표시 순서가 아니라 문제·보기 UUID를 기준으로 한다.
 */
@Injectable()
export class WrittenGradingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 한 필기 파트 제출을 채점한다. 이미 `GRADED`거나 채점 대상 상태가 아니면
   * 아무 일도 하지 않는다(배치가 여러 번 불러도 안전하다).
   */
  async gradeWrittenSubmission(submissionId: string): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.gradeWrittenSubmissionTx(tx, submissionId),
    );
  }

  /**
   * 채점 본체를 외부 트랜잭션 안에서 실행한다. 학생의 최종 제출과 채점을
   * 한 트랜잭션으로 묶어, 제출은 됐는데 채점 호출이 유실되는 창을 없앤다
   * (기획안 §26 "시험 답안 최종 제출과 자동 채점").
   */
  async gradeWrittenSubmissionTx(
    tx: Prisma.TransactionClient,
    submissionId: string,
  ): Promise<void> {
    const submission = await tx.examPartSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        examId: true,
        examAttemptId: true,
        examPart: {
          select: {
            id: true,
            type: true,
            passScore: true,
          },
        },
      },
    });
    if (
      !submission ||
      submission.examPart.type !== ExamPartType.WRITTEN ||
      submission.status !== AttemptStatus.SUBMITTED
    ) {
      return;
    }

    const questions = await tx.examQuestion.findMany({
      where: { examPartId: submission.examPart.id },
      select: {
        id: true,
        type: true,
        score: true,
        normalizationVersion: true,
        options: { select: { id: true, isCorrect: true } },
        acceptedAnswers: { select: { normalizedAnswer: true } },
      },
    });
    const answers = await tx.examAnswer.findMany({
      where: { examPartSubmissionId: submission.id },
      select: {
        id: true,
        examQuestionId: true,
        subjectiveText: true,
        normalizedText: true,
        selectedOptions: { select: { examQuestionOptionId: true } },
      },
    });
    const answerByQuestion = new Map(
      answers.map((answer) => [answer.examQuestionId, answer]),
    );

    const graded = questions.map((question) => {
      const answer = answerByQuestion.get(question.id) ?? null;
      const score = Number(question.score);
      let isCorrect: boolean;

      if (question.type === QuestionType.SHORT_ANSWER) {
        const accepted = question.acceptedAnswers.map(
          (a) => a.normalizedAnswer,
        );
        if (answer?.normalizedText != null) {
          // 저장 당시 동결된 정규화 값을 그대로 비교한다.
          isCorrect =
            answer.normalizedText.length > 0 &&
            accepted.includes(answer.normalizedText);
        } else {
          // 동결값이 없는 예전 답안: 문항 스냅샷의 정규화 버전으로 다시 정규화한다.
          const text = answer?.subjectiveText ?? '';
          const version = question.normalizationVersion
            ? Number(question.normalizationVersion)
            : ANSWER_NORMALIZATION_VERSION;
          isCorrect =
            text.length > 0 && matchesAcceptedAnswer(text, accepted, version);
        }
      } else {
        const correctIds = question.options
          .filter((option) => option.isCorrect)
          .map((option) => option.id);
        const chosenIds = answer
          ? answer.selectedOptions.map((s) => s.examQuestionOptionId)
          : [];
        isCorrect = chosenIds.length > 0 && sameSet(correctIds, chosenIds);
      }

      return {
        answerId: answer?.id ?? null,
        isCorrect,
        awardedScore: isCorrect ? score : 0,
      };
    });

    const partScore = round2(
      graded.reduce((sum, entry) => sum + entry.awardedScore, 0),
    );
    const passScore = Number(submission.examPart.passScore);
    const partResult =
      partScore >= passScore ? PassStatus.PASS : PassStatus.FAIL;
    const now = new Date();

    // 답이 있는 문항만 정오답·획득 점수를 기록한다. 미응답 문항은 0점으로 합산됐다.
    for (const entry of graded) {
      if (entry.answerId === null) {
        continue;
      }
      await tx.examAnswer.update({
        where: { id: entry.answerId },
        data: {
          isCorrect: entry.isCorrect,
          awardedScore: entry.awardedScore,
        },
      });
    }

    const claimed = await tx.examPartSubmission.updateMany({
      where: { id: submission.id, status: AttemptStatus.SUBMITTED },
      data: {
        status: AttemptStatus.GRADED,
        score: partScore,
        result: partResult,
        gradedAt: now,
      },
    });
    if (claimed.count === 0) {
      return; // 다른 경로가 이미 채점했다.
    }

    await this.rollUpAttempt(tx, submission.examAttemptId);
  }

  /**
   * 응시 기록의 파트 점수·합격 여부를 다시 계산한다.
   *
   * 채점된 실기 제출이 함께 있으면 두 파트 모두 `PASS`일 때만 최종 `PASS`다.
   * 실기 제출 자체가 없으면(실기 흐름은 이번 작업 범위 밖) 필기 결과를 최종
   * 결과로 사용한다. 실기 제출이 있으나 아직 채점 전이면 필기 결과만 반영하고
   * `GRADING`에 둔다.
   */
  private async rollUpAttempt(
    tx: Prisma.TransactionClient,
    attemptId: string,
  ): Promise<void> {
    const attempt = await tx.examAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        version: true,
        partSubmissions: {
          select: {
            status: true,
            score: true,
            result: true,
            examPart: { select: { type: true } },
          },
        },
      },
    });
    if (!attempt) {
      return;
    }

    const writtenSub = attempt.partSubmissions.find(
      (submission) => submission.examPart.type === ExamPartType.WRITTEN,
    );
    const practicalSub = attempt.partSubmissions.find(
      (submission) => submission.examPart.type === ExamPartType.PRACTICAL,
    );

    const writtenScore =
      writtenSub?.score !== undefined && writtenSub?.score !== null
        ? Number(writtenSub.score)
        : null;
    const writtenResult = writtenSub?.result ?? PassStatus.PENDING;
    const practicalScore =
      practicalSub?.score !== undefined && practicalSub?.score !== null
        ? Number(practicalSub.score)
        : null;
    const practicalResult = practicalSub?.result ?? PassStatus.PENDING;

    // 실기 제출이 아예 없으면 필기만으로 확정한다(실기 흐름 미구현).
    const practicalDone =
      !practicalSub || practicalSub.status === AttemptStatus.GRADED;

    let finalResult: PassStatus = PassStatus.PENDING;
    let status: AttemptStatus = AttemptStatus.GRADING;
    let gradedAt: Date | null = null;

    if (practicalDone) {
      if (practicalSub) {
        finalResult =
          writtenResult === PassStatus.PASS &&
          practicalResult === PassStatus.PASS
            ? PassStatus.PASS
            : PassStatus.FAIL;
      } else {
        finalResult = writtenResult;
      }
      status = AttemptStatus.GRADED;
      gradedAt = new Date();
    }

    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: {
        writtenScore,
        writtenResult,
        practicalScore,
        practicalResult,
        finalResult,
        status,
        gradedAt,
        version: attempt.version + 1,
      },
    });
  }
}
