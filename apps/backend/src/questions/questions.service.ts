import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { normalizeAnswer } from '../common/answer-normalizer';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { DifficultyLevel, QuestionType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeQuestionActiveDto } from './dto/change-question-active.dto';
import {
  CreateQuestionDto,
  QuestionOptionInput,
} from './dto/create-question.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionAccessService } from './question-access.service';

export type QuestionOptionResponse = {
  id: string;
  content: string;
  displayOrder: number;
  isCorrect: boolean;
};

export type QuestionAcceptedAnswerResponse = {
  id: string;
  answerText: string;
  normalizedAnswer: string;
  displayOrder: number;
};

export type QuestionResponse = {
  id: string;
  subjectId: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  defaultScore: number;
  difficulty: DifficultyLevel;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  options: QuestionOptionResponse[];
  acceptedAnswers: QuestionAcceptedAnswerResponse[];
};

const QUESTION_INCLUDE = {
  options: { orderBy: { displayOrder: 'asc' as const } },
  acceptedAnswers: { orderBy: { displayOrder: 'asc' as const } },
} as const;

type QuestionWithRelations = Prisma.QuestionBankGetPayload<{
  include: typeof QUESTION_INCLUDE;
}>;

type PreparedAnswer = {
  answerText: string;
  normalizedAnswer: string;
  displayOrder: number;
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QuestionAccessService,
  ) {}

  async list(
    query: QuestionQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<QuestionResponse>> {
    const where: Prisma.QuestionBankWhereInput = {};

    if (query.subjectId) {
      where.subjectId = query.subjectId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.difficulty) {
      where.difficulty = query.difficulty;
    }
    if (query.active !== undefined) {
      where.active = query.active;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.prompt = { contains: keyword, mode: 'insensitive' };
    }

    if (query.createdByMe) {
      // 본인 작성물만 보겠다는 필터는 담당 범위와 무관하게 항상 조회 가능하다.
      where.createdById = actor.id;
    } else if (!this.access.isPrivileged(actor.role)) {
      const subjectIds = await this.access.getAccessibleSubjectIds(actor.id);
      where.OR = [{ subjectId: { in: subjectIds } }, { createdById: actor.id }];
    }

    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.questionBank.findMany({
        where,
        include: QUESTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });
      const total = await tx.questionBank.count({ where });
      return [rows, total] as const;
    });

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<QuestionResponse> {
    const question = await this.prisma.questionBank.findUnique({
      where: { id },
      include: QUESTION_INCLUDE,
    });

    if (!question) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessResource(actor, {
      subjectId: question.subjectId,
      createdById: question.createdById,
    });
    if (!canAccess) {
      // 담당 범위 밖 문제는 존재 자체를 숨긴다.
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    return this.toResponse(question);
  }

  async create(
    dto: CreateQuestionDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<QuestionResponse> {
    const canWrite = await this.access.canWriteSubject(actor, dto.subjectId);
    if (!canWrite) {
      throw new ForbiddenException(
        '담당하지 않는 과목에는 문제를 작성할 수 없습니다.',
      );
    }

    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      select: { id: true, active: true },
    });
    if (!subject) {
      throw new NotFoundException('세부 과목을 찾을 수 없습니다.');
    }
    if (!subject.active) {
      throw new ConflictException('비활성 과목에는 문제를 작성할 수 없습니다.');
    }

    this.assertStructure(dto.type, dto.options, dto.acceptedAnswers);
    const preparedAnswers = this.prepareAcceptedAnswers(dto.acceptedAnswers);

    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.questionBank.create({
        data: {
          subjectId: dto.subjectId,
          type: dto.type,
          prompt: dto.prompt.trim(),
          explanation: dto.explanation?.trim() || null,
          defaultScore: dto.defaultScore,
          difficulty: dto.difficulty,
          active: dto.active,
          createdById: actor.id,
          options: {
            create: dto.options.map((option, index) => ({
              content: option.content.trim(),
              displayOrder: index,
              isCorrect: option.isCorrect,
            })),
          },
          acceptedAnswers: { create: preparedAnswers },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'QUESTION_CREATED',
          resourceType: 'QUESTION',
          resourceId: created.id,
          afterData: {
            subjectId: created.subjectId,
            type: created.type,
            difficulty: created.difficulty,
            active: created.active,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created.id;
    });

    return this.getById(id, actor);
  }

  async update(
    id: string,
    dto: UpdateQuestionDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<QuestionResponse> {
    const existing = await this.prisma.questionBank.findUnique({
      where: { id },
      include: QUESTION_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessResource(actor, {
      subjectId: existing.subjectId,
      createdById: existing.createdById,
    });
    if (!canAccess) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    const nextSubjectId = dto.subjectId ?? existing.subjectId;
    if (dto.subjectId && dto.subjectId !== existing.subjectId) {
      const canWrite = await this.access.canWriteSubject(actor, dto.subjectId);
      if (!canWrite) {
        throw new ForbiddenException(
          '담당하지 않는 과목으로는 옮길 수 없습니다.',
        );
      }
      const subject = await this.prisma.subject.findUnique({
        where: { id: dto.subjectId },
        select: { id: true, active: true },
      });
      if (!subject) {
        throw new NotFoundException('세부 과목을 찾을 수 없습니다.');
      }
      if (!subject.active) {
        throw new ConflictException(
          '비활성 과목으로는 문제를 옮길 수 없습니다.',
        );
      }
    }

    const nextType = dto.type ?? existing.type;
    const replaceOptions = dto.options !== undefined || dto.type !== undefined;
    const replaceAnswers =
      dto.acceptedAnswers !== undefined || dto.type !== undefined;

    const nextOptions: QuestionOptionInput[] =
      dto.options ??
      existing.options.map((option) => ({
        content: option.content,
        isCorrect: option.isCorrect,
      }));
    const nextAnswerTexts =
      dto.acceptedAnswers ??
      existing.acceptedAnswers.map((answer) => answer.answerText);

    this.assertStructure(nextType, nextOptions, nextAnswerTexts);
    const preparedAnswers = this.prepareAcceptedAnswers(nextAnswerTexts);

    await this.prisma.$transaction(async (tx) => {
      if (replaceOptions) {
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        if (nextOptions.length > 0) {
          await tx.questionOption.createMany({
            data: nextOptions.map((option, index) => ({
              questionId: id,
              content: option.content.trim(),
              displayOrder: index,
              isCorrect: option.isCorrect,
            })),
          });
        }
      }

      if (replaceAnswers) {
        await tx.questionAcceptedAnswer.deleteMany({
          where: { questionId: id },
        });
        if (preparedAnswers.length > 0) {
          await tx.questionAcceptedAnswer.createMany({
            data: preparedAnswers.map((answer) => ({
              questionId: id,
              ...answer,
            })),
          });
        }
      }

      await tx.questionBank.update({
        where: { id },
        data: {
          subjectId: nextSubjectId,
          type: nextType,
          ...(dto.prompt !== undefined ? { prompt: dto.prompt.trim() } : {}),
          ...(dto.explanation !== undefined
            ? { explanation: dto.explanation.trim() || null }
            : {}),
          ...(dto.defaultScore !== undefined
            ? { defaultScore: dto.defaultScore }
            : {}),
          ...(dto.difficulty !== undefined
            ? { difficulty: dto.difficulty }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'QUESTION_UPDATED',
          resourceType: 'QUESTION',
          resourceId: id,
          beforeData: {
            subjectId: existing.subjectId,
            type: existing.type,
            difficulty: existing.difficulty,
          },
          afterData: {
            subjectId: nextSubjectId,
            type: nextType,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  async changeActive(
    id: string,
    dto: ChangeQuestionActiveDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<QuestionResponse> {
    const existing = await this.prisma.questionBank.findUnique({
      where: { id },
      include: QUESTION_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessResource(actor, {
      subjectId: existing.subjectId,
      createdById: existing.createdById,
    });
    if (!canAccess) {
      throw new NotFoundException('문제를 찾을 수 없습니다.');
    }

    if (existing.active === dto.active) {
      return this.toResponse(existing);
    }

    if (dto.active) {
      this.assertStructure(
        existing.type,
        existing.options,
        existing.acceptedAnswers.map((answer) => answer.answerText),
      );

      const subject = await this.prisma.subject.findUnique({
        where: { id: existing.subjectId },
        select: { active: true },
      });
      if (!subject?.active) {
        throw new ConflictException(
          '비활성 과목의 문제는 출제 가능 상태로 바꿀 수 없습니다.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.questionBank.update({
        where: { id },
        data: { active: dto.active },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: dto.active ? 'QUESTION_ACTIVATED' : 'QUESTION_DEACTIVATED',
          resourceType: 'QUESTION',
          resourceId: id,
          beforeData: { active: existing.active },
          afterData: { active: dto.active },
          reason: dto.reason?.trim() || null,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /**
   * 유형별 보기·허용 정답 개수 규칙을 검증한다(기획안 §12.1).
   *
   * 생성·수정 저장 트랜잭션과 `active = true` 전환에서 같은 규칙을 쓴다.
   */
  private assertStructure(
    type: QuestionType,
    options: Array<{ isCorrect: boolean }>,
    acceptedAnswers: string[],
  ): void {
    if (type === QuestionType.SHORT_ANSWER) {
      if (options.length > 0) {
        throw new BadRequestException(
          '단답형 문제에는 보기를 넣을 수 없습니다.',
        );
      }
      if (acceptedAnswers.length === 0) {
        throw new BadRequestException(
          '단답형 문제에는 허용 정답이 최소 1개 필요합니다.',
        );
      }
      return;
    }

    if (acceptedAnswers.length > 0) {
      throw new BadRequestException(
        '객관식 문제에는 허용 정답 목록을 넣을 수 없습니다.',
      );
    }
    if (options.length < 2) {
      throw new BadRequestException(
        '객관식 문제에는 보기가 2개 이상 필요합니다.',
      );
    }

    const correctCount = options.filter((option) => option.isCorrect).length;

    if (type === QuestionType.SINGLE_CHOICE && correctCount !== 1) {
      throw new BadRequestException(
        '단일 선택 문제의 정답 보기는 정확히 1개여야 합니다.',
      );
    }
    if (type === QuestionType.MULTIPLE_CHOICE && correctCount < 1) {
      throw new BadRequestException(
        '복수 선택 문제의 정답 보기는 1개 이상이어야 합니다.',
      );
    }
  }

  /**
   * 허용 정답 원문을 정규화해 저장용 행으로 만든다.
   *
   * 정규화 결과가 비면 채점 기준으로 쓸 수 없으므로 400, 정규화 결과가 서로
   * 겹치면 `(question_id, normalized_answer)` 유니크와 충돌하므로 400으로
   * 막는다. DB 에러를 그대로 흘리지 않는다.
   */
  private prepareAcceptedAnswers(rawAnswers: string[]): PreparedAnswer[] {
    const seen = new Set<string>();

    return rawAnswers.map((raw, index) => {
      const answerText = raw.trim();
      const normalizedAnswer = normalizeAnswer(raw);

      if (normalizedAnswer.length === 0) {
        throw new BadRequestException(
          '빈 정답은 허용 정답으로 저장할 수 없습니다.',
        );
      }
      if (seen.has(normalizedAnswer)) {
        throw new BadRequestException('중복된 정답이 있습니다.');
      }
      seen.add(normalizedAnswer);

      return { answerText, normalizedAnswer, displayOrder: index };
    });
  }

  private toResponse(question: QuestionWithRelations): QuestionResponse {
    return {
      id: question.id,
      subjectId: question.subjectId,
      type: question.type,
      prompt: question.prompt,
      explanation: question.explanation,
      defaultScore: Number(question.defaultScore),
      difficulty: question.difficulty,
      active: question.active,
      createdById: question.createdById,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
      options: question.options.map((option) => ({
        id: option.id,
        content: option.content,
        displayOrder: option.displayOrder,
        isCorrect: option.isCorrect,
      })),
      acceptedAnswers: question.acceptedAnswers.map((answer) => ({
        id: answer.id,
        answerText: answer.answerText,
        normalizedAnswer: answer.normalizedAnswer,
        displayOrder: answer.displayOrder,
      })),
    };
  }
}
