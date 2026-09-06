import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { ExamPartType, ExamScope, ExamStage } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamTemplateDto } from './dto/create-exam-template.dto';
import { ExamTemplateQueryDto } from './dto/exam-template-query.dto';
import { UpdateExamTemplateDto } from './dto/update-exam-template.dto';
import {
  PRACTICAL_FILE_SIZE_BYTES,
  PRACTICAL_MAX_FILES,
  PRACTICAL_MAX_TOTAL_SIZE_BYTES,
  UpsertExamTemplatePartDto,
} from './dto/upsert-exam-template-part.dto';
import { ExamTemplateAccessService } from './exam-template-access.service';
import {
  type ExamTemplateValidationResult,
  ExamTemplateValidationService,
} from './exam-template-validation.service';

export type ExamTemplateSubjectResponse = {
  subjectId: string;
  name: string;
  active: boolean;
};

export type ExamTemplatePartResponse = {
  id: string;
  type: ExamPartType;
  totalScore: number;
  passScore: number;
  durationMinutes: number | null;
  defaultOpenOffsetDays: number;
  defaultOpenDays: number;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
  instructions: string | null;
};

export type ExamTemplateResponse = {
  id: string;
  name: string;
  description: string | null;
  scope: ExamScope;
  stage: ExamStage;
  defaultOpenDays: number | null;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: ExamTemplateSubjectResponse[];
  parts: ExamTemplatePartResponse[];
};

const TEMPLATE_INCLUDE = {
  subjects: {
    orderBy: { subjectId: 'asc' as const },
    include: {
      subject: { select: { id: true, name: true, active: true } },
    },
  },
  parts: { orderBy: { type: 'asc' as const } },
} as const;

type TemplateWithRelations = Prisma.ExamTemplateGetPayload<{
  include: typeof TEMPLATE_INCLUDE;
}>;

/** 파트 유형에 따라 확정된 파트 열 값이다. 반대쪽 유형의 열은 항상 null이다. */
type PartWriteData = {
  totalScore: number;
  passScore: number;
  defaultOpenOffsetDays: number;
  defaultOpenDays: number;
  instructions: string | null;
  durationMinutes: number | null;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
};

@Injectable()
export class ExamTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamTemplateAccessService,
    private readonly validation: ExamTemplateValidationService,
  ) {}

  async list(
    query: ExamTemplateQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<ExamTemplateResponse>> {
    const where: Prisma.ExamTemplateWhereInput = {};

    if (query.scope) {
      where.scope = query.scope;
    }
    if (query.stage) {
      where.stage = query.stage;
    }
    if (query.active !== undefined) {
      where.active = query.active;
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.name = { contains: keyword, mode: 'insensitive' };
    }

    if (!this.access.isPrivileged(actor.role)) {
      const accessibleIds = await this.access.getAccessibleSubjectIds(actor.id);
      where.OR = [
        { createdById: actor.id },
        {
          subjects: {
            some: {},
            every: { subjectId: { in: accessibleIds } },
          },
        },
      ];
    }

    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.examTemplate.findMany({
        where,
        include: TEMPLATE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });
      const total = await tx.examTemplate.count({ where });
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
  ): Promise<ExamTemplateResponse> {
    const entity = await this.prisma.examTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!entity) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessTemplate(actor, {
      createdById: entity.createdById,
      subjectIds: entity.subjects.map((subject) => subject.subjectId),
    });
    if (!canAccess) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    return this.toResponse(entity);
  }

  async create(
    dto: CreateExamTemplateDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    const subjectIds = [...new Set(dto.subjectIds)];
    this.assertScopeSubjectCount(dto.scope, subjectIds.length);

    const canCover = await this.access.canCoverSubjects(actor, subjectIds);
    if (!canCover) {
      throw new ForbiddenException(
        '담당하지 않는 과목이 포함되어 있어 템플릿을 만들 수 없습니다.',
      );
    }

    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertSubjectsExistAndActive(tx, subjectIds);

      const created = await tx.examTemplate.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          scope: dto.scope,
          stage: dto.stage,
          defaultOpenDays: dto.defaultOpenDays ?? null,
          active: false,
          createdById: actor.id,
          subjects: {
            create: subjectIds.map((subjectId) => ({ subjectId })),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_CREATED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: created.id,
          afterData: {
            name: created.name,
            scope: created.scope,
            stage: created.stage,
            subjectIds,
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
    dto: UpdateExamTemplateDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    const existing = await this.prisma.examTemplate.findUnique({
      where: { id },
      include: TEMPLATE_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const currentSubjectIds = existing.subjects.map(
      (subject) => subject.subjectId,
    );

    const canAccess = await this.access.canAccessTemplate(actor, {
      createdById: existing.createdById,
      subjectIds: currentSubjectIds,
    });
    if (!canAccess) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    if (existing.active) {
      throw new ConflictException(
        '활성 템플릿은 수정할 수 없습니다. 복제 후 편집하세요.',
      );
    }

    const nextScope = dto.scope ?? existing.scope;
    const nextSubjectIds = dto.subjectIds
      ? [...new Set(dto.subjectIds)]
      : currentSubjectIds;

    this.assertScopeSubjectCount(nextScope, nextSubjectIds.length);

    if (dto.subjectIds !== undefined || dto.scope !== undefined) {
      const canCover = await this.access.canCoverSubjects(
        actor,
        nextSubjectIds,
      );
      if (!canCover) {
        throw new ForbiddenException(
          '담당하지 않는 과목으로는 템플릿을 구성할 수 없습니다.',
        );
      }
    }

    const subjectsChanged =
      dto.subjectIds !== undefined &&
      !this.sameSet(currentSubjectIds, nextSubjectIds);

    await this.prisma.$transaction(async (tx) => {
      if (subjectsChanged) {
        await this.assertSubjectsExistAndActive(tx, nextSubjectIds);

        const removed = currentSubjectIds.filter(
          (subjectId) => !nextSubjectIds.includes(subjectId),
        );
        if (removed.length > 0) {
          const orphanQuestionCount = await tx.examTemplateQuestion.count({
            where: {
              examTemplatePart: { examTemplateId: id },
              question: { subjectId: { in: removed } },
            },
          });
          if (orphanQuestionCount > 0) {
            throw new ConflictException(
              '빠지는 과목에 이미 선택된 문제가 있어 과목을 변경할 수 없습니다.',
            );
          }
          await tx.examTemplateSubject.deleteMany({
            where: { examTemplateId: id, subjectId: { in: removed } },
          });
        }

        const added = nextSubjectIds.filter(
          (subjectId) => !currentSubjectIds.includes(subjectId),
        );
        if (added.length > 0) {
          await tx.examTemplateSubject.createMany({
            data: added.map((subjectId) => ({
              examTemplateId: id,
              subjectId,
            })),
          });
        }
      }

      await tx.examTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
          ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
          ...(dto.defaultOpenDays !== undefined
            ? { defaultOpenDays: dto.defaultOpenDays }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_UPDATED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: id,
          beforeData: {
            name: existing.name,
            scope: existing.scope,
            stage: existing.stage,
            subjectIds: currentSubjectIds,
          },
          afterData: {
            scope: nextScope,
            subjectIds: nextSubjectIds,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  async upsertPart(
    id: string,
    type: ExamPartType,
    dto: UpsertExamTemplatePartDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    await this.loadDraftForPartWrite(id, actor);
    const data = this.buildPartData(type, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.examTemplatePart.upsert({
        where: { examTemplateId_type: { examTemplateId: id, type } },
        create: { examTemplateId: id, type, ...data },
        update: data,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_PART_UPSERTED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: id,
          afterData: { type, totalScore: data.totalScore },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  async deletePart(
    id: string,
    type: ExamPartType,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    await this.loadDraftForPartWrite(id, actor);

    const part = await this.prisma.examTemplatePart.findUnique({
      where: { examTemplateId_type: { examTemplateId: id, type } },
      select: { id: true },
    });
    if (!part) {
      throw new NotFoundException('해당 파트가 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examTemplatePart.delete({ where: { id: part.id } });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_PART_DELETED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: id,
          afterData: { type },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /**
   * 활성화하지 않고 검증 결과만 돌려준다.
   *
   * 접근 권한을 먼저 확인한다. 조회 불가는 404로 숨긴다.
   */
  async validate(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ExamTemplateValidationResult> {
    await this.loadForStateChange(id, actor);
    return this.validation.validate(id);
  }

  /**
   * 검증을 통과하면 템플릿을 활성화한다.
   *
   * 검증 실패 시 400과 함께 모든 결함 사유를 내려준다. 이미 활성이면 409다.
   */
  async activate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    const entity = await this.loadForStateChange(id, actor);
    if (entity.active) {
      throw new ConflictException('이미 활성 상태인 템플릿입니다.');
    }

    const result = await this.validation.validate(id);
    if (!result.valid) {
      throw new BadRequestException(
        result.issues.map((issue) => issue.message),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examTemplate.update({
        where: { id },
        data: { active: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_ACTIVATED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: id,
          afterData: { active: true },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /**
   * 템플릿을 비활성화한다(기획안 §23). 검증 없이 허용한다. 이미 비활성이면 409다.
   */
  async deactivate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    const entity = await this.loadForStateChange(id, actor);
    if (!entity.active) {
      throw new ConflictException('이미 비활성 상태인 템플릿입니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examTemplate.update({
        where: { id },
        data: { active: false },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_DEACTIVATED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: id,
          afterData: { active: false },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /**
   * 템플릿의 전체 구성을 복제해 새 초안을 만든다.
   *
   * 템플릿 + 과목 + 파트 + 파트별 문제 + 실기 평가 항목을 한 트랜잭션에 복사하고,
   * 이름에 접미사를 붙이며 `active = false`, `created_by = 실행자`로 만든다.
   * 원본과 사본은 이후 독립적으로 편집된다.
   */
  async duplicate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamTemplateResponse> {
    await this.loadForStateChange(id, actor);

    const source = await this.prisma.examTemplate.findUnique({
      where: { id },
      include: {
        subjects: { select: { subjectId: true } },
        parts: {
          include: {
            questions: {
              orderBy: { displayOrder: 'asc' },
              select: {
                questionId: true,
                displayOrder: true,
                score: true,
              },
            },
            practicalCriteria: {
              orderBy: { displayOrder: 'asc' },
              select: {
                name: true,
                description: true,
                maxScore: true,
                displayOrder: true,
              },
            },
          },
        },
      },
    });
    if (!source) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const newId = await this.prisma.$transaction(async (tx) => {
      const copy = await tx.examTemplate.create({
        data: {
          name: `${source.name} (복제본)`,
          description: source.description,
          scope: source.scope,
          stage: source.stage,
          defaultOpenDays: source.defaultOpenDays,
          active: false,
          createdById: actor.id,
          subjects: {
            create: source.subjects.map((link) => ({
              subjectId: link.subjectId,
            })),
          },
        },
      });

      for (const part of source.parts) {
        await tx.examTemplatePart.create({
          data: {
            examTemplateId: copy.id,
            type: part.type,
            totalScore: part.totalScore,
            passScore: part.passScore,
            durationMinutes: part.durationMinutes,
            defaultOpenOffsetDays: part.defaultOpenOffsetDays,
            defaultOpenDays: part.defaultOpenDays,
            minFiles: part.minFiles,
            maxFiles: part.maxFiles,
            maxFileSizeBytes: part.maxFileSizeBytes,
            maxTotalSizeBytes: part.maxTotalSizeBytes,
            instructions: part.instructions,
            questions: {
              create: part.questions.map((entry) => ({
                questionId: entry.questionId,
                displayOrder: entry.displayOrder,
                score: entry.score,
              })),
            },
            practicalCriteria: {
              create: part.practicalCriteria.map((criterion) => ({
                name: criterion.name,
                description: criterion.description,
                maxScore: criterion.maxScore,
                displayOrder: criterion.displayOrder,
              })),
            },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_TEMPLATE_DUPLICATED',
          resourceType: 'EXAM_TEMPLATE',
          resourceId: copy.id,
          afterData: { sourceTemplateId: id },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return copy.id;
    });

    return this.getById(newId, actor);
  }

  /**
   * 상태 전환·복제 전 공통 확인: 존재와 접근 권한(조회 불가는 404로 숨김).
   *
   * 활성 여부는 각 메서드가 판단하므로 여기서 막지 않는다.
   */
  private async loadForStateChange(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{ active: boolean; createdById: string | null }> {
    const entity = await this.prisma.examTemplate.findUnique({
      where: { id },
      select: {
        active: true,
        createdById: true,
        subjects: { select: { subjectId: true } },
      },
    });
    if (!entity) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessTemplate(actor, {
      createdById: entity.createdById,
      subjectIds: entity.subjects.map((subject) => subject.subjectId),
    });
    if (!canAccess) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    return { active: entity.active, createdById: entity.createdById };
  }

  /** 파트 쓰기 전 공통 확인: 존재·접근 권한(404로 숨김)·초안 상태(활성이면 409). */
  private async loadDraftForPartWrite(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const entity = await this.prisma.examTemplate.findUnique({
      where: { id },
      select: {
        active: true,
        createdById: true,
        subjects: { select: { subjectId: true } },
      },
    });
    if (!entity) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canAccessTemplate(actor, {
      createdById: entity.createdById,
      subjectIds: entity.subjects.map((subject) => subject.subjectId),
    });
    if (!canAccess) {
      throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
    }

    if (entity.active) {
      throw new ConflictException(
        '활성 템플릿의 파트는 변경할 수 없습니다. 복제 후 편집하세요.',
      );
    }
  }

  private assertScopeSubjectCount(scope: ExamScope, count: number): void {
    if (scope === ExamScope.SUBJECT && count !== 1) {
      throw new BadRequestException(
        '과목형(SUBJECT) 템플릿은 과목이 정확히 1개여야 합니다.',
      );
    }
    if (scope === ExamScope.COMPREHENSIVE && count < 1) {
      throw new BadRequestException(
        '종합형(COMPREHENSIVE) 템플릿은 과목이 1개 이상이어야 합니다.',
      );
    }
  }

  private async assertSubjectsExistAndActive(
    tx: Prisma.TransactionClient,
    subjectIds: string[],
  ): Promise<void> {
    const subjects = await tx.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, active: true },
    });

    if (subjects.length !== subjectIds.length) {
      throw new NotFoundException('존재하지 않는 과목이 포함되어 있습니다.');
    }
    if (subjects.some((subject) => !subject.active)) {
      throw new BadRequestException(
        '비활성 과목은 시험 템플릿에 포함할 수 없습니다.',
      );
    }
  }

  /**
   * 파트 유형별 필드 배타 규칙(2단계 CHECK 제약과 동일)을 검증하고 저장할 값을
   * 확정한다. 필기 파트는 제한 시간만, 실기 파트는 파일 제한만 가진다.
   */
  private buildPartData(
    type: ExamPartType,
    dto: UpsertExamTemplatePartDto,
  ): PartWriteData {
    if (dto.passScore > dto.totalScore) {
      throw new BadRequestException('합격 점수는 총점보다 클 수 없습니다.');
    }

    const common = {
      totalScore: dto.totalScore,
      passScore: dto.passScore,
      defaultOpenOffsetDays: dto.defaultOpenOffsetDays,
      defaultOpenDays: dto.defaultOpenDays,
      instructions: dto.instructions?.trim() || null,
    };

    if (type === ExamPartType.WRITTEN) {
      const hasFileLimits =
        dto.minFiles !== undefined ||
        dto.maxFiles !== undefined ||
        dto.maxFileSizeBytes !== undefined ||
        dto.maxTotalSizeBytes !== undefined;
      if (hasFileLimits) {
        throw new BadRequestException(
          '필기 파트에는 파일 제한을 설정할 수 없습니다.',
        );
      }
      if (dto.durationMinutes === undefined) {
        throw new BadRequestException('필기 파트에는 제한 시간이 필요합니다.');
      }

      return {
        ...common,
        durationMinutes: dto.durationMinutes,
        minFiles: null,
        maxFiles: null,
        maxFileSizeBytes: null,
        maxTotalSizeBytes: null,
      };
    }

    if (dto.durationMinutes !== undefined) {
      throw new BadRequestException(
        '실기 파트에는 제한 시간을 설정할 수 없습니다.',
      );
    }
    if (dto.minFiles === undefined) {
      throw new BadRequestException(
        '실기 파트에는 최소 제출 파일 수가 필요합니다.',
      );
    }

    const maxFiles = dto.maxFiles ?? PRACTICAL_MAX_FILES;
    const maxTotalSizeBytes =
      dto.maxTotalSizeBytes ?? PRACTICAL_MAX_TOTAL_SIZE_BYTES;

    if (dto.minFiles > maxFiles) {
      throw new BadRequestException(
        '최소 제출 파일 수가 최대 제출 파일 수보다 많습니다.',
      );
    }

    return {
      ...common,
      durationMinutes: null,
      minFiles: dto.minFiles,
      maxFiles,
      // 파일당 최대 크기는 클라이언트 입력과 무관하게 5MiB로 고정한다.
      maxFileSizeBytes: PRACTICAL_FILE_SIZE_BYTES,
      maxTotalSizeBytes,
    };
  }

  private sameSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const set = new Set(a);
    return b.every((value) => set.has(value));
  }

  private toResponse(entity: TemplateWithRelations): ExamTemplateResponse {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      scope: entity.scope,
      stage: entity.stage,
      defaultOpenDays: entity.defaultOpenDays,
      active: entity.active,
      createdById: entity.createdById,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      subjects: entity.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        name: subject.subject.name,
        active: subject.subject.active,
      })),
      parts: entity.parts.map((part) => ({
        id: part.id,
        type: part.type,
        totalScore: Number(part.totalScore),
        passScore: Number(part.passScore),
        durationMinutes: part.durationMinutes,
        defaultOpenOffsetDays: part.defaultOpenOffsetDays,
        defaultOpenDays: part.defaultOpenDays,
        minFiles: part.minFiles,
        maxFiles: part.maxFiles,
        maxFileSizeBytes:
          part.maxFileSizeBytes === null ? null : Number(part.maxFileSizeBytes),
        maxTotalSizeBytes:
          part.maxTotalSizeBytes === null
            ? null
            : Number(part.maxTotalSizeBytes),
        instructions: part.instructions,
      })),
    };
  }
}
