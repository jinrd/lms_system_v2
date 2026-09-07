import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { normalizeAnswer } from '../common/answer-normalizer';
import {
  AttemptStatus,
  ExamStatus,
  QuestionType,
  SubmissionMethod,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SaveWrittenAnswerDto } from './dto/save-written-answer.dto';
import { WrittenGradingService } from './written-grading.service';

/** 학생에게 노출해도 되는 시험 요약이다. 정답·해설은 절대 담지 않는다. */
export type MyExamSummary = {
  examId: string;
  title: string;
  scope: string;
  stage: string;
  status: ExamStatus;
  opensAt: string;
  closesAt: string;
  written: {
    partId: string;
    opensAt: string;
    closesAt: string;
    durationMinutes: number;
    submissionStatus: AttemptStatus | null;
    deadlineAt: string | null;
  } | null;
};

export type MyWrittenQuestion = {
  examQuestionId: string;
  type: QuestionType;
  prompt: string;
  score: number;
  displayOrder: number;
  options: Array<{
    examQuestionOptionId: string;
    content: string;
    displayOrder: number;
  }>;
  answer: {
    subjectiveText: string | null;
    selectedOptionIds: string[];
    version: number;
    savedAt: string | null;
  } | null;
};

export type MyWrittenQuestionsResponse = {
  examId: string;
  partId: string;
  submissionStatus: AttemptStatus;
  deadlineAt: string;
  questions: MyWrittenQuestion[];
};

export type SaveWrittenAnswerResponse = {
  examQuestionId: string;
  version: number;
  savedAt: string;
};

/** 학생 본인의 응시 기록 + 시험 + 필기 파트를 함께 담는다. */
type AttemptContext = {
  attemptId: string;
  attemptStatus: AttemptStatus;
  examStatus: ExamStatus;
  writtenPart: {
    id: string;
    opensAt: Date;
    closesAt: Date;
    durationMinutes: number;
  };
};

/** Fisher–Yates 셔플. 표시 순서 무작위화에만 쓰며 암호학적 요구는 없다. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 학생의 필기 시험 응시를 다룬다(기획안 §8.4·§15.2·§15.3·D-34).
 *
 * 파트 최초 시작 시 문제·보기 순서를 학생별로 무작위 고정하고, 답안은 문항별로
 * 자동 저장(UPSERT + 버전 충돌 방지)하며, 최종 제출 후에는 수정을 막는다. 학생
 * 응답 어디에도 정답 보기, 단답형 허용 정답, 해설, 채점 결과를 담지 않는다.
 *
 * 자동 채점과 개인 마감 자동 제출은 다음 단계(5단계)에서 붙인다. 실기 파트는
 * 이번 작업 범위에서 제외한다.
 */
@Injectable()
export class StudentExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writtenGrading: WrittenGradingService,
  ) {}

  async listMyExams(actor: AuthenticatedUser): Promise<MyExamSummary[]> {
    const attempts = await this.prisma.examAttempt.findMany({
      where: {
        studentId: actor.id,
        exam: { status: { notIn: [ExamStatus.DRAFT, ExamStatus.CANCELED] } },
      },
      orderBy: { exam: { opensAt: 'desc' } },
      select: {
        exam: {
          select: {
            id: true,
            title: true,
            scope: true,
            stage: true,
            status: true,
            opensAt: true,
            closesAt: true,
            parts: {
              where: { type: 'WRITTEN' },
              select: {
                id: true,
                opensAt: true,
                closesAt: true,
                durationMinutes: true,
              },
            },
          },
        },
        partSubmissions: {
          select: { examPartId: true, status: true, deadlineAt: true },
        },
      },
    });

    return attempts.map((attempt) => {
      const exam = attempt.exam;
      const writtenPart = exam.parts[0] ?? null;
      const writtenSubmission = writtenPart
        ? (attempt.partSubmissions.find(
            (submission) => submission.examPartId === writtenPart.id,
          ) ?? null)
        : null;

      return {
        examId: exam.id,
        title: exam.title,
        scope: exam.scope,
        stage: exam.stage,
        status: exam.status,
        opensAt: exam.opensAt.toISOString(),
        closesAt: exam.closesAt.toISOString(),
        written:
          writtenPart && writtenPart.durationMinutes !== null
            ? {
                partId: writtenPart.id,
                opensAt: writtenPart.opensAt.toISOString(),
                closesAt: writtenPart.closesAt.toISOString(),
                durationMinutes: writtenPart.durationMinutes,
                submissionStatus: writtenSubmission?.status ?? null,
                deadlineAt:
                  writtenSubmission?.deadlineAt?.toISOString() ?? null,
              }
            : null,
      };
    });
  }

  async getMyExam(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<MyExamSummary> {
    const summary = (await this.listMyExams(actor)).find(
      (item) => item.examId === examId,
    );
    if (!summary) {
      throw new NotFoundException('응시 대상 시험이 아닙니다.');
    }
    return summary;
  }

  /**
   * 필기 파트를 시작한다. 이미 시작했으면 기존 순서를 그대로 돌려준다(재셔플 금지).
   */
  async startWritten(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<MyWrittenQuestionsResponse> {
    const ctx = await this.loadAttemptContext(actor, examId);
    this.assertWrittenOpen(ctx);

    const existing = await this.prisma.examPartSubmission.findUnique({
      where: {
        examAttemptId_examPartId: {
          examAttemptId: ctx.attemptId,
          examPartId: ctx.writtenPart.id,
        },
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== AttemptStatus.NOT_STARTED) {
      return this.getWrittenQuestions(actor, examId);
    }

    const now = new Date();
    const timeoutDeadline = new Date(
      now.getTime() + ctx.writtenPart.durationMinutes * 60_000,
    );
    const deadlineAt =
      timeoutDeadline < ctx.writtenPart.closesAt
        ? timeoutDeadline
        : ctx.writtenPart.closesAt;

    const questions = await this.prisma.examQuestion.findMany({
      where: { examPartId: ctx.writtenPart.id },
      orderBy: { displayOrder: 'asc' },
      select: { id: true, options: { select: { id: true } } },
    });

    await this.prisma.$transaction(async (tx) => {
      const submission = await tx.examPartSubmission.create({
        data: {
          examId,
          examAttemptId: ctx.attemptId,
          examPartId: ctx.writtenPart.id,
          status: AttemptStatus.IN_PROGRESS,
          result: 'PENDING',
          startedAt: now,
          deadlineAt,
          lastSavedAt: now,
          version: 0,
        },
      });

      if (ctx.attemptStatus === AttemptStatus.NOT_STARTED) {
        await tx.examAttempt.update({
          where: { id: ctx.attemptId },
          data: { status: AttemptStatus.IN_PROGRESS, startedAt: now },
        });
      }

      const questionOrder = shuffled(questions);
      await tx.examAttemptQuestionOrder.createMany({
        data: questionOrder.map((question, index) => ({
          examPartSubmissionId: submission.id,
          examPartId: ctx.writtenPart.id,
          examQuestionId: question.id,
          displayOrder: index,
        })),
      });

      const optionOrderRows = questionOrder.flatMap((question) =>
        shuffled(question.options).map((option, index) => ({
          examPartSubmissionId: submission.id,
          examPartId: ctx.writtenPart.id,
          examQuestionId: question.id,
          examQuestionOptionId: option.id,
          displayOrder: index,
        })),
      );
      if (optionOrderRows.length > 0) {
        await tx.examAttemptOptionOrder.createMany({ data: optionOrderRows });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_WRITTEN_STARTED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { submissionId: submission.id },
          result: 'SUCCESS',
        },
      });
    });

    return this.getWrittenQuestions(actor, examId);
  }

  async getWrittenQuestions(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<MyWrittenQuestionsResponse> {
    const ctx = await this.loadAttemptContext(actor, examId);

    const submission = await this.prisma.examPartSubmission.findUnique({
      where: {
        examAttemptId_examPartId: {
          examAttemptId: ctx.attemptId,
          examPartId: ctx.writtenPart.id,
        },
      },
      select: { id: true, status: true, deadlineAt: true },
    });
    if (!submission) {
      throw new ConflictException('아직 시작하지 않은 필기 파트입니다.');
    }

    const [questionOrders, optionOrders, questions, answers] =
      await Promise.all([
        this.prisma.examAttemptQuestionOrder.findMany({
          where: { examPartSubmissionId: submission.id },
          orderBy: { displayOrder: 'asc' },
          select: { examQuestionId: true, displayOrder: true },
        }),
        this.prisma.examAttemptOptionOrder.findMany({
          where: { examPartSubmissionId: submission.id },
          orderBy: { displayOrder: 'asc' },
          select: {
            examQuestionId: true,
            examQuestionOptionId: true,
            displayOrder: true,
          },
        }),
        this.prisma.examQuestion.findMany({
          where: { examPartId: ctx.writtenPart.id },
          select: {
            id: true,
            type: true,
            prompt: true,
            score: true,
            options: { select: { id: true, content: true } },
          },
        }),
        this.prisma.examAnswer.findMany({
          where: { examPartSubmissionId: submission.id },
          select: {
            examQuestionId: true,
            subjectiveText: true,
            version: true,
            savedAt: true,
            selectedOptions: { select: { examQuestionOptionId: true } },
          },
        }),
      ]);

    const questionById = new Map(questions.map((q) => [q.id, q]));
    const optionContentById = new Map(
      questions.flatMap((q) =>
        q.options.map((o) => [o.id, o.content] as const),
      ),
    );
    const answerByQuestion = new Map(
      answers.map((answer) => [answer.examQuestionId, answer]),
    );
    const optionOrdersByQuestion = new Map<
      string,
      Array<{ examQuestionOptionId: string; displayOrder: number }>
    >();
    for (const row of optionOrders) {
      const list = optionOrdersByQuestion.get(row.examQuestionId) ?? [];
      list.push(row);
      optionOrdersByQuestion.set(row.examQuestionId, list);
    }

    const rendered: MyWrittenQuestion[] = questionOrders.map((order) => {
      const question = questionById.get(order.examQuestionId);
      if (!question) {
        throw new NotFoundException('문제 스냅샷이 손상되었습니다.');
      }
      const answer = answerByQuestion.get(order.examQuestionId) ?? null;

      return {
        examQuestionId: question.id,
        type: question.type,
        prompt: question.prompt,
        score: Number(question.score),
        displayOrder: order.displayOrder,
        options: (optionOrdersByQuestion.get(question.id) ?? []).map(
          (optionOrder) => ({
            examQuestionOptionId: optionOrder.examQuestionOptionId,
            content:
              optionContentById.get(optionOrder.examQuestionOptionId) ?? '',
            displayOrder: optionOrder.displayOrder,
          }),
        ),
        answer: answer
          ? {
              subjectiveText: answer.subjectiveText,
              selectedOptionIds: answer.selectedOptions.map(
                (selected) => selected.examQuestionOptionId,
              ),
              version: answer.version,
              savedAt: answer.savedAt.toISOString(),
            }
          : null,
      };
    });

    return {
      examId,
      partId: ctx.writtenPart.id,
      submissionStatus: submission.status,
      deadlineAt: submission.deadlineAt?.toISOString() ?? '',
      questions: rendered,
    };
  }

  async saveWrittenAnswer(
    actor: AuthenticatedUser,
    examId: string,
    questionId: string,
    dto: SaveWrittenAnswerDto,
  ): Promise<SaveWrittenAnswerResponse> {
    const ctx = await this.loadAttemptContext(actor, examId);
    this.assertNotCanceled(ctx);

    const submission = await this.prisma.examPartSubmission.findUnique({
      where: {
        examAttemptId_examPartId: {
          examAttemptId: ctx.attemptId,
          examPartId: ctx.writtenPart.id,
        },
      },
      select: { id: true, status: true, deadlineAt: true },
    });
    if (!submission) {
      throw new ConflictException('아직 시작하지 않은 필기 파트입니다.');
    }
    if (submission.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('이미 제출했거나 마감된 파트입니다.');
    }
    const now = new Date();
    if (submission.deadlineAt && now > submission.deadlineAt) {
      throw new ConflictException('개인 마감 시각이 지나 저장할 수 없습니다.');
    }

    const question = await this.prisma.examQuestion.findFirst({
      where: { id: questionId, examPartId: ctx.writtenPart.id },
      select: { id: true, type: true, options: { select: { id: true } } },
    });
    if (!question) {
      throw new NotFoundException('이 파트의 문제가 아닙니다.');
    }

    const selectedOptionIds = [...new Set(dto.selectedOptionIds ?? [])];
    const subjectiveRaw = dto.subjectiveText?.trim() ?? '';

    if (question.type === QuestionType.SHORT_ANSWER) {
      if (selectedOptionIds.length > 0) {
        throw new BadRequestException(
          '단답형 문항에는 보기를 선택할 수 없습니다.',
        );
      }
    } else {
      if (subjectiveRaw.length > 0) {
        throw new BadRequestException(
          '객관식 문항에는 서술 답안을 넣을 수 없습니다.',
        );
      }
      const validIds = new Set(question.options.map((option) => option.id));
      if (selectedOptionIds.some((id) => !validIds.has(id))) {
        throw new BadRequestException('이 문항의 보기가 아닌 선택입니다.');
      }
      if (
        question.type === QuestionType.SINGLE_CHOICE &&
        selectedOptionIds.length > 1
      ) {
        throw new BadRequestException(
          '단일 선택 문항은 보기를 1개만 고를 수 있습니다.',
        );
      }
    }

    const newVersion = await this.prisma.$transaction(async (tx) => {
      const current = await tx.examAnswer.findUnique({
        where: {
          examPartSubmissionId_examQuestionId: {
            examPartSubmissionId: submission.id,
            examQuestionId: questionId,
          },
        },
        select: { id: true, version: true },
      });

      const expectedVersion = current?.version ?? 0;
      if (dto.version !== expectedVersion) {
        throw new ConflictException(
          '다른 곳에서 먼저 저장되었습니다. 최신 답안을 다시 불러오세요.',
        );
      }
      const nextVersion = expectedVersion + 1;

      const isShort = question.type === QuestionType.SHORT_ANSWER;
      const answerData = {
        subjectiveText: isShort && subjectiveRaw ? subjectiveRaw : null,
        normalizedText:
          isShort && subjectiveRaw ? normalizeAnswer(subjectiveRaw) : null,
        savedAt: now,
        version: nextVersion,
      };

      const answer = await tx.examAnswer.upsert({
        where: {
          examPartSubmissionId_examQuestionId: {
            examPartSubmissionId: submission.id,
            examQuestionId: questionId,
          },
        },
        create: {
          examPartSubmissionId: submission.id,
          examPartId: ctx.writtenPart.id,
          examQuestionId: questionId,
          ...answerData,
        },
        update: answerData,
        select: { id: true },
      });

      await tx.examAnswerSelectedOption.deleteMany({
        where: { examAnswerId: answer.id },
      });
      if (!isShort && selectedOptionIds.length > 0) {
        await tx.examAnswerSelectedOption.createMany({
          data: selectedOptionIds.map((optionId) => ({
            examAnswerId: answer.id,
            examQuestionId: questionId,
            examQuestionOptionId: optionId,
          })),
        });
      }

      await tx.examPartSubmission.update({
        where: { id: submission.id },
        data: { lastSavedAt: now },
      });

      return nextVersion;
    });

    return {
      examQuestionId: questionId,
      version: newVersion,
      savedAt: now.toISOString(),
    };
  }

  async submitWritten(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<MyWrittenQuestionsResponse> {
    const ctx = await this.loadAttemptContext(actor, examId);
    this.assertNotCanceled(ctx);

    const submission = await this.prisma.examPartSubmission.findUnique({
      where: {
        examAttemptId_examPartId: {
          examAttemptId: ctx.attemptId,
          examPartId: ctx.writtenPart.id,
        },
      },
      select: { id: true, status: true, version: true, deadlineAt: true },
    });
    if (!submission) {
      throw new ConflictException('아직 시작하지 않은 필기 파트입니다.');
    }
    if (submission.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException('이미 제출한 파트입니다.');
    }

    const now = new Date();
    // 개인 마감이 지난 뒤에는 수동 제출을 받지 않는다. 마지막으로 저장된 답안을
    // 배치가 자동 제출·채점한다(기획안 §8.4·D-25).
    if (submission.deadlineAt && now > submission.deadlineAt) {
      throw new ConflictException(
        '개인 마감 시각이 지났습니다. 마지막으로 저장된 답안이 자동 제출됩니다.',
      );
    }
    const claimed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.examPartSubmission.updateMany({
        where: { id: submission.id, status: AttemptStatus.IN_PROGRESS },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: now,
          submissionMethod: SubmissionMethod.MANUAL,
          version: submission.version + 1,
        },
      });
      if (updated.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_WRITTEN_SUBMITTED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { submissionId: submission.id, method: 'MANUAL' },
          result: 'SUCCESS',
        },
      });
      return true;
    });

    // 제출 직후 즉시 자동 채점한다. 배치와 경합해도 채점 쪽이 상태로 방어한다.
    if (claimed) {
      await this.writtenGrading.gradeWrittenSubmission(submission.id);
    }

    return this.getWrittenQuestions(actor, examId);
  }

  private assertWrittenOpen(ctx: AttemptContext): void {
    this.assertNotCanceled(ctx);
    const now = new Date();
    if (now < ctx.writtenPart.opensAt || now > ctx.writtenPart.closesAt) {
      throw new ConflictException('필기 파트 응시 기간이 아닙니다.');
    }
  }

  /** 취소된 시험은 응시 시작·자동 저장·최종 제출을 모두 차단한다(기획안 §14.1·D-31). */
  private assertNotCanceled(ctx: AttemptContext): void {
    if (ctx.examStatus === ExamStatus.CANCELED) {
      throw new ConflictException('취소된 시험입니다.');
    }
  }

  private async loadAttemptContext(
    actor: AuthenticatedUser,
    examId: string,
  ): Promise<AttemptContext> {
    const attempt = await this.prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId: actor.id } },
      select: {
        id: true,
        status: true,
        exam: {
          select: {
            status: true,
            parts: {
              where: { type: 'WRITTEN' },
              select: {
                id: true,
                opensAt: true,
                closesAt: true,
                durationMinutes: true,
              },
            },
          },
        },
      },
    });
    if (!attempt) {
      throw new NotFoundException('응시 대상 시험이 아닙니다.');
    }

    const writtenPart = attempt.exam.parts[0];
    if (!writtenPart || writtenPart.durationMinutes === null) {
      throw new NotFoundException('필기 파트가 없는 시험입니다.');
    }

    return {
      attemptId: attempt.id,
      attemptStatus: attempt.status,
      examStatus: attempt.exam.status,
      writtenPart: {
        id: writtenPart.id,
        opensAt: writtenPart.opensAt,
        closesAt: writtenPart.closesAt,
        durationMinutes: writtenPart.durationMinutes,
      },
    };
  }
}
