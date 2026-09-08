import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ANSWER_NORMALIZATION_VERSION,
  normalizeAnswer,
} from '../common/answer-normalizer';
import type { Prisma } from '../generated/prisma/client';
import {
  ExamPartType,
  ExamStatus,
  QuestionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { checkQuestionStructure } from '../questions/question-structure';
import type { ReplaceExamPracticalCriteriaDto } from './dto/replace-exam-practical-criteria.dto';
import type {
  ExamQuestionInput,
  ReplaceExamQuestionsDto,
} from './dto/replace-exam-questions.dto';
import { ExamAccessService } from './exam-access.service';

export type ExamQuestionEntry = {
  id: string;
  courseOfferingSubjectId: string;
  sourceQuestionId: string | null;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  score: number;
  displayOrder: number;
  normalizationVersion: string | null;
  options: Array<{
    id: string;
    content: string;
    displayOrder: number;
    isCorrect: boolean;
  }>;
  acceptedAnswers: Array<{
    id: string;
    answerText: string;
    normalizedAnswer: string;
  }>;
};

export type ExamCriterionEntry = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  displayOrder: number;
};

/**
 * 담긴 점수 합계와 파트 총점의 차이다.
 *
 * `difference = assignedScoreSum - partTotalScore`. 초안 편집 중에는 0이 아니어도
 * 정상이며, 최종 일치 검증은 2단계 예약 검증에서 한다.
 */
type ScoreSummary = {
  partId: string;
  partTotalScore: number;
  assignedScoreSum: number;
  difference: number;
};

export type ExamQuestionsResponse = ScoreSummary & {
  examId: string;
  questions: ExamQuestionEntry[];
};

export type ExamCriteriaResponse = ScoreSummary & {
  examId: string;
  criteria: ExamCriterionEntry[];
};

const DAY_MS = 86_400_000;

/** 소수 둘째 자리까지만 남긴다. Decimal(6,2) 합산의 부동소수 오차를 없앤다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

/**
 * 실제 시험의 파트 구성(필기 문제 스냅샷 · 실기 평가 항목)을 다룬다.
 *
 * 실제 시험 문제·보기·정답·기준은 문제은행 원본과 독립된 **불변 스냅샷**이다.
 * 시험이 `DRAFT`를 벗어나면 이 서비스로 더 이상 수정할 수 없다(기획안 §14.5·§14.9).
 * 순서 유니크 제약 때문에 목록은 항상 전량 교체 방식으로만 저장한다.
 */
@Injectable()
export class ExamCompositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
  ) {}

  /**
   * 템플릿의 과목·필기 파트 구성·문제를 새 시험의 스냅샷으로 복사한다.
   *
   * 템플릿은 배점을 갖지 않는다. 필기 파트의 총점·합격점은 `params`에서 받고,
   * 각 문제 배점은 문제은행 기본 배점으로 채운다. 최종 합계 일치는 예약 전
   * 검증(§14.9)에서 확인한다. 실기 파트는 이번 범위 밖이라 스냅샷하지 않는다.
   *
   * 호출자(`ExamsService.create`)의 트랜잭션 안에서 실행한다. 파트의 실제
   * 시작·종료 시각은 템플릿의 상대 오프셋 일수를 시험 시작 시각에 더해 만든다.
   */
  async snapshotFromTemplate(
    tx: Prisma.TransactionClient,
    params: {
      examId: string;
      courseOfferingId: string;
      templateId: string;
      examOpensAt: Date;
      writtenTotalScore: number;
      writtenPassScore: number;
    },
  ): Promise<void> {
    const template = await tx.examTemplate.findUnique({
      where: { id: params.templateId },
      include: {
        subjects: { select: { subjectId: true } },
        parts: {
          include: {
            questions: {
              orderBy: { displayOrder: 'asc' },
              include: {
                question: {
                  include: {
                    options: { orderBy: { displayOrder: 'asc' } },
                    acceptedAnswers: { orderBy: { displayOrder: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!template) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const writtenPart = template.parts.find(
      (part) => part.type === ExamPartType.WRITTEN,
    );
    if (writtenPart) {
      if (
        params.writtenPassScore < 0 ||
        params.writtenPassScore > params.writtenTotalScore
      ) {
        throw new BadRequestException(
          '필기 합격 점수는 0점 이상 총점 이하여야 합니다.',
        );
      }
    }

    const subjectIds = template.subjects.map((link) => link.subjectId);
    const coSubjects = await tx.courseOfferingSubject.findMany({
      where: {
        courseOfferingId: params.courseOfferingId,
        subjectId: { in: subjectIds },
      },
      select: { id: true, subjectId: true },
    });
    if (coSubjects.length !== subjectIds.length) {
      throw new BadRequestException(
        '템플릿 과목 중 시험의 개설 강의에 포함되지 않은 과목이 있습니다.',
      );
    }
    const cosBySubject = new Map(
      coSubjects.map((row) => [row.subjectId, row.id]),
    );

    await tx.examSubject.createMany({
      data: coSubjects.map((row) => ({
        examId: params.examId,
        courseOfferingId: params.courseOfferingId,
        courseOfferingSubjectId: row.id,
      })),
    });

    if (writtenPart) {
      const opensAt = addDays(
        params.examOpensAt,
        writtenPart.defaultOpenOffsetDays,
      );
      const closesAt = addDays(opensAt, writtenPart.defaultOpenDays);

      const createdPart = await tx.examPart.create({
        data: {
          examId: params.examId,
          type: ExamPartType.WRITTEN,
          totalScore: params.writtenTotalScore,
          passScore: params.writtenPassScore,
          opensAt,
          closesAt,
          durationMinutes: writtenPart.durationMinutes,
          instructions: writtenPart.instructions,
        },
      });

      for (const [index, templateQuestion] of writtenPart.questions.entries()) {
        const bank = templateQuestion.question;
        const cosId = cosBySubject.get(bank.subjectId);
        if (!cosId) {
          throw new BadRequestException(
            '문제의 과목이 시험 과목에 포함되지 않았습니다.',
          );
        }

        await tx.examQuestion.create({
          data: {
            examId: params.examId,
            examPartId: createdPart.id,
            courseOfferingSubjectId: cosId,
            sourceQuestionId: bank.id,
            type: bank.type,
            prompt: bank.prompt,
            explanation: bank.explanation,
            // 템플릿은 배점을 갖지 않으므로 문제은행 기본 배점으로 채운다.
            // 출제자가 예약 전에 조정할 수 있고, 합계 일치는 §14.9에서 확인한다.
            score: bank.defaultScore,
            displayOrder: index,
            normalizationVersion:
              bank.type === QuestionType.SHORT_ANSWER
                ? String(ANSWER_NORMALIZATION_VERSION)
                : null,
            options: {
              create: bank.options.map((option, optionIndex) => ({
                content: option.content,
                displayOrder: optionIndex,
                isCorrect: option.isCorrect,
              })),
            },
            acceptedAnswers: {
              create: bank.acceptedAnswers.map((answer) => ({
                answerText: answer.answerText,
                normalizedAnswer: answer.normalizedAnswer,
              })),
            },
          },
        });
      }
    }
  }

  async getWrittenQuestions(
    examId: string,
    actor: AuthenticatedUser,
  ): Promise<ExamQuestionsResponse> {
    const ctx = await this.loadPartContext(
      examId,
      ExamPartType.WRITTEN,
      actor,
      false,
    );

    const rows = await this.prisma.examQuestion.findMany({
      where: { examPartId: ctx.partId },
      orderBy: { displayOrder: 'asc' },
      include: {
        options: { orderBy: { displayOrder: 'asc' } },
        acceptedAnswers: true,
      },
    });

    const questions = rows.map((row) => this.toQuestionEntry(row));
    const assignedScoreSum = round2(
      questions.reduce((sum, entry) => sum + entry.score, 0),
    );

    return {
      examId,
      partId: ctx.partId,
      partTotalScore: ctx.partTotalScore,
      assignedScoreSum,
      difference: round2(assignedScoreSum - ctx.partTotalScore),
      questions,
    };
  }

  async replaceWrittenQuestions(
    examId: string,
    dto: ReplaceExamQuestionsDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamQuestionsResponse> {
    const ctx = await this.loadPartContext(
      examId,
      ExamPartType.WRITTEN,
      actor,
      true,
    );

    const items = dto.questions;
    const subjectIdSet = new Set(ctx.examSubjects.map((s) => s.subjectId));
    const cosBySubject = new Map(
      ctx.examSubjects.map((s) => [s.subjectId, s.courseOfferingSubjectId]),
    );

    const sourceIds = items
      .map((item) => item.sourceQuestionId)
      .filter((id): id is string => typeof id === 'string');
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new BadRequestException(
        '같은 문제은행 문제를 두 번 담을 수 없습니다.',
      );
    }

    const bankById = new Map<
      string,
      Prisma.QuestionBankGetPayload<{
        include: { options: true; acceptedAnswers: true };
      }>
    >();
    if (sourceIds.length > 0) {
      const found = await this.prisma.questionBank.findMany({
        where: { id: { in: sourceIds } },
        include: {
          options: { orderBy: { displayOrder: 'asc' } },
          acceptedAnswers: { orderBy: { displayOrder: 'asc' } },
        },
      });
      for (const question of found) {
        bankById.set(question.id, question);
      }
    }

    /** 각 항목을 exam_questions 생성용 데이터로 변환한다(트랜잭션 밖에서 검증 완료). */
    const prepared = items.map((item, index) =>
      this.prepareQuestion(item, index, {
        subjectIdSet,
        cosBySubject,
        bankById,
        onlySubjectId:
          ctx.examSubjects.length === 1 ? ctx.examSubjects[0].subjectId : null,
      }),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.examQuestion.deleteMany({ where: { examPartId: ctx.partId } });

      for (const data of prepared) {
        await tx.examQuestion.create({
          data: {
            examId,
            examPartId: ctx.partId,
            courseOfferingSubjectId: data.courseOfferingSubjectId,
            sourceQuestionId: data.sourceQuestionId,
            type: data.type,
            prompt: data.prompt,
            explanation: data.explanation,
            score: data.score,
            displayOrder: data.displayOrder,
            normalizationVersion: data.normalizationVersion,
            options: { create: data.options },
            acceptedAnswers: { create: data.acceptedAnswers },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_QUESTIONS_REPLACED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { partId: ctx.partId, questionCount: prepared.length },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getWrittenQuestions(examId, actor);
  }

  async getPracticalCriteria(
    examId: string,
    actor: AuthenticatedUser,
  ): Promise<ExamCriteriaResponse> {
    const ctx = await this.loadPartContext(
      examId,
      ExamPartType.PRACTICAL,
      actor,
      false,
    );

    const rows = await this.prisma.examPracticalCriterion.findMany({
      where: { examPartId: ctx.partId },
      orderBy: { displayOrder: 'asc' },
    });

    const criteria: ExamCriterionEntry[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      maxScore: Number(row.maxScore),
      displayOrder: row.displayOrder,
    }));
    const assignedScoreSum = round2(
      criteria.reduce((sum, entry) => sum + entry.maxScore, 0),
    );

    return {
      examId,
      partId: ctx.partId,
      partTotalScore: ctx.partTotalScore,
      assignedScoreSum,
      difference: round2(assignedScoreSum - ctx.partTotalScore),
      criteria,
    };
  }

  async replacePracticalCriteria(
    examId: string,
    dto: ReplaceExamPracticalCriteriaDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamCriteriaResponse> {
    const ctx = await this.loadPartContext(
      examId,
      ExamPartType.PRACTICAL,
      actor,
      true,
    );

    const items = dto.criteria.map((item) => ({
      name: item.name.trim(),
      description: item.description?.trim() || null,
      maxScore: item.maxScore,
    }));
    if (items.some((item) => item.name.length === 0)) {
      throw new BadRequestException('평가 항목명은 비워둘 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examPracticalCriterion.deleteMany({
        where: { examPartId: ctx.partId },
      });
      if (items.length > 0) {
        await tx.examPracticalCriterion.createMany({
          data: items.map((item, index) => ({
            examPartId: ctx.partId,
            name: item.name,
            description: item.description,
            maxScore: item.maxScore,
            displayOrder: index,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_CRITERIA_REPLACED',
          resourceType: 'EXAM',
          resourceId: examId,
          afterData: { partId: ctx.partId, criterionCount: items.length },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getPracticalCriteria(examId, actor);
  }

  /**
   * 한 문제 입력을 검증하고 exam_questions 생성용 데이터로 확정한다.
   *
   * `sourceQuestionId`가 있으면 문제은행에서 스냅샷을 뜨고, 없으면 직접 입력을
   * 유형별 규칙으로 검증한다. 던지는 예외는 모두 `BadRequestException`이다.
   */
  private prepareQuestion(
    item: ExamQuestionInput,
    index: number,
    ctx: {
      subjectIdSet: Set<string>;
      cosBySubject: Map<string, string>;
      bankById: Map<
        string,
        Prisma.QuestionBankGetPayload<{
          include: { options: true; acceptedAnswers: true };
        }>
      >;
      onlySubjectId: string | null;
    },
  ): {
    courseOfferingSubjectId: string;
    sourceQuestionId: string | null;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    score: number;
    displayOrder: number;
    normalizationVersion: string | null;
    options: Array<{
      content: string;
      displayOrder: number;
      isCorrect: boolean;
    }>;
    acceptedAnswers: Array<{ answerText: string; normalizedAnswer: string }>;
  } {
    if (item.sourceQuestionId) {
      const bank = ctx.bankById.get(item.sourceQuestionId);
      if (!bank) {
        throw new BadRequestException(
          `문제은행 문제를 찾을 수 없습니다: ${item.sourceQuestionId}`,
        );
      }
      if (!ctx.subjectIdSet.has(bank.subjectId)) {
        throw new BadRequestException(
          '시험 과목에 포함되지 않은 과목의 문제는 담을 수 없습니다.',
        );
      }
      if (!bank.active) {
        throw new BadRequestException('비활성 문제는 담을 수 없습니다.');
      }

      const cosId = ctx.cosBySubject.get(bank.subjectId);
      if (!cosId) {
        throw new BadRequestException(
          '문제 과목을 시험 과목에서 찾을 수 없습니다.',
        );
      }

      return {
        courseOfferingSubjectId: cosId,
        sourceQuestionId: bank.id,
        type: bank.type,
        prompt: bank.prompt,
        explanation: bank.explanation,
        score: item.score,
        displayOrder: index,
        normalizationVersion:
          bank.type === QuestionType.SHORT_ANSWER
            ? String(ANSWER_NORMALIZATION_VERSION)
            : null,
        options: bank.options.map((option, optionIndex) => ({
          content: option.content,
          displayOrder: optionIndex,
          isCorrect: option.isCorrect,
        })),
        acceptedAnswers: bank.acceptedAnswers.map((answer) => ({
          answerText: answer.answerText,
          normalizedAnswer: answer.normalizedAnswer,
        })),
      };
    }

    // 직접 입력
    if (!item.type || !item.prompt || item.prompt.trim().length === 0) {
      throw new BadRequestException(
        '직접 입력 문제에는 유형과 내용이 필요합니다.',
      );
    }
    if (!ctx.onlySubjectId) {
      throw new BadRequestException(
        '직접 입력 문제는 대상 과목이 하나인 시험에서만 담을 수 있습니다.',
      );
    }
    const cosId = ctx.cosBySubject.get(ctx.onlySubjectId);
    if (!cosId) {
      throw new BadRequestException('시험 과목을 확인할 수 없습니다.');
    }

    const options = (item.options ?? []).map((option, optionIndex) => ({
      content: option.content.trim(),
      displayOrder: optionIndex,
      isCorrect: option.isCorrect,
    }));
    const acceptedRaw = item.acceptedAnswers ?? [];

    const structureError = checkQuestionStructure({
      type: item.type,
      optionCount: options.length,
      correctOptionCount: options.filter((option) => option.isCorrect).length,
      acceptedAnswerCount: acceptedRaw.length,
    });
    if (structureError) {
      throw new BadRequestException(structureError);
    }

    const acceptedAnswers = acceptedRaw.map((answer) => ({
      answerText: answer.trim(),
      normalizedAnswer: normalizeAnswer(answer),
    }));
    const normalizedSet = new Set(
      acceptedAnswers.map((answer) => answer.normalizedAnswer),
    );
    if (normalizedSet.size !== acceptedAnswers.length) {
      throw new BadRequestException('중복된 허용 정답이 있습니다.');
    }

    return {
      courseOfferingSubjectId: cosId,
      sourceQuestionId: null,
      type: item.type,
      prompt: item.prompt.trim(),
      explanation: item.explanation?.trim() || null,
      score: item.score,
      displayOrder: index,
      normalizationVersion:
        item.type === QuestionType.SHORT_ANSWER
          ? String(ANSWER_NORMALIZATION_VERSION)
          : null,
      options,
      acceptedAnswers,
    };
  }

  private toQuestionEntry(
    row: Prisma.ExamQuestionGetPayload<{
      include: { options: true; acceptedAnswers: true };
    }>,
  ): ExamQuestionEntry {
    return {
      id: row.id,
      courseOfferingSubjectId: row.courseOfferingSubjectId,
      sourceQuestionId: row.sourceQuestionId,
      type: row.type,
      prompt: row.prompt,
      explanation: row.explanation,
      score: Number(row.score),
      displayOrder: row.displayOrder,
      normalizationVersion: row.normalizationVersion,
      options: row.options
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((option) => ({
          id: option.id,
          content: option.content,
          displayOrder: option.displayOrder,
          isCorrect: option.isCorrect,
        })),
      acceptedAnswers: row.acceptedAnswers.map((answer) => ({
        id: answer.id,
        answerText: answer.answerText,
        normalizedAnswer: answer.normalizedAnswer,
      })),
    };
  }

  /**
   * 시험 존재·접근 권한·(쓰기라면) 초안 여부를 확인하고 대상 파트를 찾는다.
   *
   * 조회 불가는 404로 숨기고, 예약된 시험에 쓰기 시도는 409, 해당 유형의 파트가
   * 없으면 404다.
   */
  private async loadPartContext(
    examId: string,
    type: ExamPartType,
    actor: AuthenticatedUser,
    forWrite: boolean,
  ): Promise<{
    partId: string;
    partTotalScore: number;
    examSubjects: Array<{ courseOfferingSubjectId: string; subjectId: string }>;
  }> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        status: true,
        createdById: true,
        courseOffering: { select: { instructorId: true } },
        subjects: {
          select: {
            courseOfferingSubjectId: true,
            courseOfferingSubject: { select: { subjectId: true } },
          },
        },
        parts: { where: { type }, select: { id: true, totalScore: true } },
      },
    });
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    const examSubjects = exam.subjects.map((link) => ({
      courseOfferingSubjectId: link.courseOfferingSubjectId,
      subjectId: link.courseOfferingSubject.subjectId,
    }));

    const canAccess = await this.access.canManageExam(actor, {
      courseOfferingInstructorId: exam.courseOffering.instructorId,
      createdById: exam.createdById,
      subjectIds: examSubjects.map((link) => link.subjectId),
    });
    if (!canAccess) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    if (forWrite && exam.status !== ExamStatus.DRAFT) {
      throw new ConflictException('예약된 시험의 구성은 변경할 수 없습니다.');
    }

    const part = exam.parts[0];
    if (!part) {
      throw new NotFoundException(
        type === ExamPartType.WRITTEN
          ? '필기 파트가 없습니다. 먼저 파트를 만드세요.'
          : '실기 파트가 없습니다. 먼저 파트를 만드세요.',
      );
    }

    return {
      partId: part.id,
      partTotalScore: Number(part.totalScore),
      examSubjects,
    };
  }
}
