import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
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

export type TemplateQuestionsResponse = {
  templateId: string;
  partId: string;
  /** 동시 편집 방지용. 다음 편집 요청에 그대로 되돌려 보낸다. */
  updatedAt: string;
  questions: TemplateQuestionEntry[];
};

export type TemplateCriteriaResponse = {
  templateId: string;
  partId: string;
  updatedAt: string;
  criteria: TemplateCriterionEntry[];
};

/**
 * 시험 템플릿 파트의 구성(필기 문제 선택 · 실기 평가 항목)을 다룬다.
 *
 * 순서 유니크 제약 때문에 목록은 항상 전량 교체 방식으로만 저장한다. 템플릿은
 * 배점을 갖지 않으므로 점수 합계는 다루지 않는다. 배점·총점 일치 검증은 실제
 * 시험 예약 전 검증(§14.9)에서 한다.
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

    return {
      templateId,
      partId: ctx.partId,
      updatedAt: ctx.updatedAt.toISOString(),
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
    );
    this.assertFresh(ctx.updatedAt, dto.expectedUpdatedAt);

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
          })),
        });
      }
      await this.touch(tx, templateId);

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

    return {
      templateId,
      partId: ctx.partId,
      updatedAt: ctx.updatedAt.toISOString(),
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
    );
    this.assertFresh(ctx.updatedAt, dto.expectedUpdatedAt);

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
      await this.touch(tx, templateId);

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
   * 동시 편집을 막는다. 마지막으로 읽은 `updatedAt`과 현재 값이 다르면 409.
   */
  private assertFresh(current: Date, expected: string): void {
    if (current.getTime() !== new Date(expected).getTime()) {
      throw new ConflictException(
        '다른 곳에서 먼저 저장되었습니다. 템플릿을 다시 불러온 뒤 편집하세요.',
      );
    }
  }

  /** 자식 테이블만 바뀌어도 템플릿 updatedAt을 올려 낙관적 락 기준을 갱신한다. */
  private touch(
    tx: Prisma.TransactionClient,
    templateId: string,
  ): Promise<unknown> {
    return tx.examTemplate.update({
      where: { id: templateId },
      data: { updatedAt: new Date() },
    });
  }

  /**
   * 템플릿 존재·접근 권한을 확인하고 대상 파트를 찾는다. 조회 불가는 404,
   * 해당 유형의 파트가 없으면 404다. `updatedAt`은 낙관적 락에 쓴다.
   */
  private async loadPartContext(
    templateId: string,
    type: ExamPartType,
    actor: AuthenticatedUser,
  ): Promise<{
    partId: string;
    updatedAt: Date;
    templateSubjectIds: string[];
  }> {
    const template = await this.prisma.examTemplate.findUnique({
      where: { id: templateId },
      select: {
        createdById: true,
        updatedAt: true,
        subjects: { select: { subjectId: true } },
        parts: {
          where: { type },
          select: { id: true },
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
      updatedAt: template.updatedAt,
      templateSubjectIds,
    };
  }
}
