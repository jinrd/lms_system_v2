import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  DifficultyLevel,
  ExamPartType,
  QuestionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReplaceTemplateCriteriaDto } from './dto/replace-template-criteria.dto';
import { ReplaceTemplateQuestionsDto } from './dto/replace-template-questions.dto';
import { ExamTemplateAccessService } from './exam-template-access.service';

export type TemplateQuestionEntry = {
  id: string;
  questionId: string;
  displayOrder: number;
  score: number;
  question: {
    id: string;
    subjectId: string;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    difficulty: DifficultyLevel;
    defaultScore: number;
    active: boolean;
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
      displayOrder: number;
    }>;
  };
};

export type TemplateCriterionEntry = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  displayOrder: number;
};

/**
 * 담긴 점수 합계와 파트 총점의 차이다.
 *
 * `difference = assignedScoreSum - partTotalScore`. 양수면 담은 점수가 총점보다
 * 많고, 음수면 모자란다. 초안 편집 중에는 0이 아니어도 정상이며, 최종 일치
 * 검증은 6단계 활성화 검증에서 한다.
 */
type ScoreSummary = {
  partId: string;
  partTotalScore: number;
  assignedScoreSum: number;
  difference: number;
};

export type TemplateQuestionsResponse = ScoreSummary & {
  templateId: string;
  questions: TemplateQuestionEntry[];
};

export type TemplateCriteriaResponse = ScoreSummary & {
  templateId: string;
  criteria: TemplateCriterionEntry[];
};

/** 소수 둘째 자리까지만 남긴다. Decimal(6,2) 합산의 부동소수 오차를 없앤다. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 시험 템플릿 파트의 구성(필기 문제 선택 · 실기 평가 항목)을 다룬다.
 *
 * 순서 유니크 제약 때문에 목록은 항상 전량 교체 방식으로만 저장한다. 점수
 * 합계 검증은 하지 않고, 대신 응답에 합계·총점·차이를 실어 프론트가 실시간
 * 으로 보여줄 수 있게 한다(기획안 §13.4, §13.5).
 */
@Injectable()
export class ExamTemplateCompositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamTemplateAccessService,
  ) {}

  async getWrittenQuestions(
    templateId: string,
    actor: AuthenticatedUser,
  ): Promise<TemplateQuestionsResponse> {
    const ctx = await this.loadPartContext(
      templateId,
      ExamPartType.WRITTEN,
      actor,
      false,
    );

    const rows = await this.prisma.examTemplateQuestion.findMany({
      where: { examTemplatePartId: ctx.partId },
      orderBy: { displayOrder: 'asc' },
      include: {
        question: {
          include: {
            options: { orderBy: { displayOrder: 'asc' } },
            acceptedAnswers: { orderBy: { displayOrder: 'asc' } },
          },
        },
      },
    });

    const questions: TemplateQuestionEntry[] = rows.map((row) => ({
      id: row.id,
      questionId: row.questionId,
      displayOrder: row.displayOrder,
      score: Number(row.score),
      question: {
        id: row.question.id,
        subjectId: row.question.subjectId,
        type: row.question.type,
        prompt: row.question.prompt,
        explanation: row.question.explanation,
        difficulty: row.question.difficulty,
        defaultScore: Number(row.question.defaultScore),
        active: row.question.active,
        options: row.question.options.map((option) => ({
          id: option.id,
          content: option.content,
          displayOrder: option.displayOrder,
          isCorrect: option.isCorrect,
        })),
        acceptedAnswers: row.question.acceptedAnswers.map((answer) => ({
          id: answer.id,
          answerText: answer.answerText,
          normalizedAnswer: answer.normalizedAnswer,
          displayOrder: answer.displayOrder,
        })),
      },
    }));

    const assignedScoreSum = round2(
      questions.reduce((sum, entry) => sum + entry.score, 0),
    );

    return {
      templateId,
      partId: ctx.partId,
      partTotalScore: ctx.partTotalScore,
      assignedScoreSum,
      difference: round2(assignedScoreSum - ctx.partTotalScore),
      questions,
    };
  }

  async replaceWrittenQuestions(
    templateId: string,
    dto: ReplaceTemplateQuestionsDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateQuestionsResponse> {
    const ctx = await this.loadPartContext(
      templateId,
      ExamPartType.WRITTEN,
      actor,
      true,
    );

    const items = dto.questions;
    const ids = items.map((item) => item.questionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('같은 문제를 두 번 담을 수 없습니다.');
    }

    if (ids.length > 0) {
      const found = await this.prisma.questionBank.findMany({
        where: { id: { in: ids } },
        select: { id: true, subjectId: true, active: true },
      });
      const byId = new Map(found.map((question) => [question.id, question]));

      for (const item of items) {
        const question = byId.get(item.questionId);
        if (!question) {
          throw new BadRequestException(
            `문제를 찾을 수 없습니다: ${item.questionId}`,
          );
        }
        if (!ctx.templateSubjectIds.includes(question.subjectId)) {
          throw new BadRequestException(
            '템플릿에 포함되지 않은 과목의 문제는 담을 수 없습니다.',
          );
        }
        if (!question.active) {
          throw new BadRequestException('비활성 문제는 담을 수 없습니다.');
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examTemplateQuestion.deleteMany({
        where: { examTemplatePartId: ctx.partId },
      });
      if (items.length > 0) {
        await tx.examTemplateQuestion.createMany({
          data: items.map((item, index) => ({
            examTemplatePartId: ctx.partId,
            questionId: item.questionId,
            displayOrder: index,
            score: item.score,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_QUESTIONS_REPLACED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: templateId,
          afterData: { partId: ctx.partId, questionCount: items.length },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getWrittenQuestions(templateId, actor);
  }

  async getPracticalCriteria(
    templateId: string,
    actor: AuthenticatedUser,
  ): Promise<TemplateCriteriaResponse> {
    const ctx = await this.loadPartContext(
      templateId,
      ExamPartType.PRACTICAL,
      actor,
      false,
    );

    const rows = await this.prisma.examTemplatePracticalCriterion.findMany({
      where: { examTemplatePartId: ctx.partId },
      orderBy: { displayOrder: 'asc' },
    });

    const criteria: TemplateCriterionEntry[] = rows.map((row) => ({
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
      templateId,
      partId: ctx.partId,
      partTotalScore: ctx.partTotalScore,
      assignedScoreSum,
      difference: round2(assignedScoreSum - ctx.partTotalScore),
      criteria,
    };
  }

  async replacePracticalCriteria(
    templateId: string,
    dto: ReplaceTemplateCriteriaDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateCriteriaResponse> {
    const ctx = await this.loadPartContext(
      templateId,
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
      await tx.examTemplatePracticalCriterion.deleteMany({
        where: { examTemplatePartId: ctx.partId },
      });
      if (items.length > 0) {
        await tx.examTemplatePracticalCriterion.createMany({
          data: items.map((item, index) => ({
            examTemplatePartId: ctx.partId,
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
          action: 'EXAM_TEMPLATE_CRITERIA_REPLACED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: templateId,
          afterData: { partId: ctx.partId, criterionCount: items.length },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getPracticalCriteria(templateId, actor);
  }

  /**
   * 템플릿 존재·접근 권한·(쓰기라면) 초안 여부를 확인하고, 대상 파트를 찾는다.
   *
   * 조회 불가는 404로 숨기고, 활성 템플릿에 쓰기 시도는 409, 해당 유형의 파트가
   * 없으면 404다.
   */
  private async loadPartContext(
    templateId: string,
    type: ExamPartType,
    actor: AuthenticatedUser,
    forWrite: boolean,
  ): Promise<{
    partId: string;
    partTotalScore: number;
    templateSubjectIds: string[];
  }> {
    const template = await this.prisma.examTemplate.findUnique({
      where: { id: templateId },
      select: {
        active: true,
        createdById: true,
        subjects: { select: { subjectId: true } },
        parts: {
          where: { type },
          select: { id: true, totalScore: true },
        },
      },
    });
    if (!template) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const templateSubjectIds = template.subjects.map(
      (subject) => subject.subjectId,
    );

    const canAccess = await this.access.canAccessTemplate(actor, {
      createdById: template.createdById,
      subjectIds: templateSubjectIds,
    });
    if (!canAccess) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    if (forWrite && template.active) {
      throw new ConflictException(
        '활성 템플릿의 구성은 변경할 수 없습니다. 복제 후 편집하세요.',
      );
    }

    const part = template.parts[0];
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
      templateSubjectIds,
    };
  }
}
