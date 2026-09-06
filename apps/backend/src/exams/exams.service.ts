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
import {
  ExamPartType,
  ExamScope,
  ExamStage,
  ExamStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CancelExamDto } from './dto/cancel-exam.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import {
  PRACTICAL_FILE_SIZE_BYTES,
  PRACTICAL_MAX_FILES,
  PRACTICAL_MAX_TOTAL_SIZE_BYTES,
  UpsertExamPartDto,
} from './dto/upsert-exam-part.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamAccessService } from './exam-access.service';
import { ExamCompositionService } from './exam-composition.service';
import {
  type ExamScheduleValidationResult,
  ExamScheduleValidationService,
} from './exam-schedule-validation.service';

export type ExamSubjectResponse = {
  courseOfferingSubjectId: string;
  subjectId: string;
  name: string;
  active: boolean;
};

export type ExamClassTargetResponse = {
  classId: string;
  name: string;
};

export type ExamPartResponse = {
  id: string;
  type: ExamPartType;
  totalScore: number;
  passScore: number;
  opensAt: string;
  closesAt: string;
  durationMinutes: number | null;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
  instructions: string | null;
};

export type ExamResponse = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  sourceTemplateId: string | null;
  sourceExamId: string | null;
  title: string;
  description: string | null;
  scope: ExamScope;
  stage: ExamStage;
  status: ExamStatus;
  opensAt: string;
  closesAt: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: ExamSubjectResponse[];
  classTargets: ExamClassTargetResponse[];
  parts: ExamPartResponse[];
};

const EXAM_INCLUDE = {
  courseOffering: { select: { id: true, name: true, instructorId: true } },
  subjects: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: { select: { id: true, name: true, active: true } },
        },
      },
    },
  },
  classTargets: {
    include: { class: { select: { id: true, name: true } } },
  },
  parts: { orderBy: { type: 'asc' as const } },
} as const;

type ExamWithRelations = Prisma.ExamGetPayload<{
  include: typeof EXAM_INCLUDE;
}>;

/** 파트 유형에 따라 확정된 파트 열 값이다. 반대쪽 유형의 열은 항상 null이다. */
type PartWriteData = {
  totalScore: number;
  passScore: number;
  opensAt: Date;
  closesAt: Date;
  instructions: string | null;
  durationMinutes: number | null;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
};

@Injectable()
export class ExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ExamAccessService,
    private readonly composition: ExamCompositionService,
    private readonly scheduleValidation: ExamScheduleValidationService,
  ) {}

  async list(
    query: ExamQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<ExamResponse>> {
    const where: Prisma.ExamWhereInput = {};

    if (query.courseOfferingId) {
      where.courseOfferingId = query.courseOfferingId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.stage) {
      where.stage = query.stage;
    }
    if (query.scope) {
      where.scope = query.scope;
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.title = { contains: keyword, mode: 'insensitive' };
    }

    if (!this.access.isPrivileged(actor.role)) {
      where.OR = [
        { createdById: actor.id },
        { courseOffering: { instructorId: actor.id } },
      ];
    }

    const { skip, take } = toSkipTake(query);

    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.exam.findMany({
        where,
        include: EXAM_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });
      const total = await tx.exam.count({ where });
      return [rows, total] as const;
    });

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<ExamResponse> {
    const entity = await this.prisma.exam.findUnique({
      where: { id },
      include: EXAM_INCLUDE,
    });
    if (!entity) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canManageExam(actor, {
      courseOfferingInstructorId: entity.courseOffering.instructorId,
      createdById: entity.createdById,
      subjectIds: entity.subjects.map(
        (link) => link.courseOfferingSubject.subject.id,
      ),
    });
    if (!canAccess) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    return this.toResponse(entity);
  }

  async create(
    dto: CreateExamDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamResponse> {
    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (opensAt >= closesAt) {
      throw new BadRequestException(
        '응시 시작 시각은 종료 시각보다 앞서야 합니다.',
      );
    }

    const courseOffering = await this.prisma.courseOffering.findUnique({
      where: { id: dto.courseOfferingId },
      select: { id: true, instructorId: true, archivedAt: true },
    });
    if (!courseOffering) {
      throw new NotFoundException('개설 강의를 찾을 수 없습니다.');
    }
    if (courseOffering.archivedAt) {
      throw new BadRequestException(
        '보관된 개설 강의에는 시험을 만들 수 없습니다.',
      );
    }

    if (
      !this.access.isPrivileged(actor.role) &&
      courseOffering.instructorId !== actor.id
    ) {
      throw new ForbiddenException(
        '담당하지 않는 교육과정에는 시험을 만들 수 없습니다.',
      );
    }

    if (dto.sourceTemplateId) {
      const template = await this.prisma.examTemplate.findUnique({
        where: { id: dto.sourceTemplateId },
        select: {
          id: true,
          scope: true,
          active: true,
          subjects: { select: { subjectId: true } },
        },
      });
      if (!template) {
        throw new NotFoundException('시험 템플릿을 찾을 수 없습니다.');
      }
      if (!template.active) {
        throw new BadRequestException(
          '활성 템플릿만 실제 시험으로 만들 수 있습니다.',
        );
      }
      if (template.scope !== dto.scope) {
        throw new BadRequestException('시험 범위가 템플릿의 범위와 다릅니다.');
      }

      const canCover = await this.access.canCoverSubjects(
        actor,
        template.subjects.map((link) => link.subjectId),
      );
      if (!canCover) {
        throw new ForbiddenException(
          '담당하지 않는 과목이 포함된 템플릿으로는 시험을 만들 수 없습니다.',
        );
      }
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.exam.create({
        data: {
          courseOfferingId: dto.courseOfferingId,
          sourceTemplateId: dto.sourceTemplateId ?? null,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          scope: dto.scope,
          stage: dto.stage,
          status: ExamStatus.DRAFT,
          opensAt,
          closesAt,
          createdById: actor.id,
        },
      });

      if (dto.sourceTemplateId) {
        await this.composition.snapshotFromTemplate(tx, {
          examId: created.id,
          courseOfferingId: dto.courseOfferingId,
          templateId: dto.sourceTemplateId,
          examOpensAt: opensAt,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_CREATED',
          resourceType: 'EXAM',
          resourceId: created.id,
          afterData: {
            courseOfferingId: dto.courseOfferingId,
            sourceTemplateId: dto.sourceTemplateId ?? null,
            scope: dto.scope,
            stage: dto.stage,
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
    dto: UpdateExamDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamResponse> {
    const existing = await this.loadForManage(id, actor);
    this.assertDraft(existing.status);

    const opensAt = dto.opensAt ? new Date(dto.opensAt) : existing.opensAt;
    const closesAt = dto.closesAt ? new Date(dto.closesAt) : existing.closesAt;
    if (opensAt >= closesAt) {
      throw new BadRequestException(
        '응시 시작 시각은 종료 시각보다 앞서야 합니다.',
      );
    }

    let nextCourseOfferingSubjectIds: string[] | null = null;
    if (dto.subjectIds !== undefined) {
      nextCourseOfferingSubjectIds = await this.resolveCourseOfferingSubjects(
        existing.courseOfferingId,
        dto.subjectIds,
      );
    }

    let nextClassTargetIds: string[] | null = null;
    if (dto.classTargetIds !== undefined) {
      await this.assertClassesInCourseOffering(
        existing.courseOfferingId,
        dto.classTargetIds,
      );
      nextClassTargetIds = [...new Set(dto.classTargetIds)];
    }

    await this.prisma.$transaction(async (tx) => {
      if (nextCourseOfferingSubjectIds !== null) {
        const current = existing.courseOfferingSubjectIds;
        const removed = current.filter(
          (cosId) => !nextCourseOfferingSubjectIds.includes(cosId),
        );
        if (removed.length > 0) {
          const orphanQuestions = await tx.examQuestion.count({
            where: {
              examId: id,
              courseOfferingSubjectId: { in: removed },
            },
          });
          if (orphanQuestions > 0) {
            throw new ConflictException(
              '빠지는 과목에 이미 담긴 문제가 있어 과목을 변경할 수 없습니다.',
            );
          }
          await tx.examSubject.deleteMany({
            where: { examId: id, courseOfferingSubjectId: { in: removed } },
          });
        }

        const added = nextCourseOfferingSubjectIds.filter(
          (cosId) => !current.includes(cosId),
        );
        if (added.length > 0) {
          await tx.examSubject.createMany({
            data: added.map((cosId) => ({
              examId: id,
              courseOfferingId: existing.courseOfferingId,
              courseOfferingSubjectId: cosId,
            })),
          });
        }
      }

      if (nextClassTargetIds !== null) {
        await tx.examClassTarget.deleteMany({ where: { examId: id } });
        if (nextClassTargetIds.length > 0) {
          await tx.examClassTarget.createMany({
            data: nextClassTargetIds.map((classId) => ({
              examId: id,
              courseOfferingId: existing.courseOfferingId,
              classId,
            })),
          });
        }
      }

      await tx.exam.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.scope !== undefined ? { scope: dto.scope } : {}),
          ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
          ...(dto.opensAt !== undefined ? { opensAt } : {}),
          ...(dto.closesAt !== undefined ? { closesAt } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_UPDATED',
          resourceType: 'EXAM',
          resourceId: id,
          afterData: {
            scope: dto.scope ?? existing.scope,
            subjectIdsChanged: dto.subjectIds !== undefined,
            classTargetsChanged: dto.classTargetIds !== undefined,
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
    dto: UpsertExamPartDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamResponse> {
    const existing = await this.loadForManage(id, actor);
    this.assertDraft(existing.status);

    const data = this.buildPartData(type, dto);

    await this.prisma.$transaction(async (tx) => {
      await tx.examPart.upsert({
        where: { examId_type: { examId: id, type } },
        create: { examId: id, type, ...data },
        update: data,
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_PART_UPSERTED',
          resourceType: 'EXAM',
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
  ): Promise<ExamResponse> {
    const existing = await this.loadForManage(id, actor);
    this.assertDraft(existing.status);

    const part = await this.prisma.examPart.findUnique({
      where: { examId_type: { examId: id, type } },
      select: { id: true },
    });
    if (!part) {
      throw new NotFoundException('해당 파트가 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.examPart.delete({ where: { id: part.id } });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_PART_DELETED',
          resourceType: 'EXAM',
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
   * 예약하지 않고 §14.9 검증 결과만 돌려준다.
   *
   * 접근 권한을 먼저 확인한다. 조회 불가는 404로 숨긴다.
   */
  async validate(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ExamScheduleValidationResult> {
    await this.loadForManage(id, actor);
    return this.scheduleValidation.validate(id);
  }

  /**
   * 검증을 통과하면 시험을 `DRAFT → SCHEDULED`로 전환한다.
   *
   * 같은 트랜잭션에서 시험 전체 응시 기간을 파트 봉투(최소 시작 ~ 최대 종료)에
   * 맞춘다(기획안 §14.4). 검증 실패 시 400과 함께 모든 결함 사유를 내려준다.
   */
  async schedule(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamResponse> {
    const existing = await this.loadForManage(id, actor);
    if (existing.status !== ExamStatus.DRAFT) {
      throw new ConflictException('초안 상태의 시험만 예약할 수 있습니다.');
    }

    const result = await this.scheduleValidation.validate(id);
    if (!result.valid) {
      throw new BadRequestException(
        result.issues.map((issue) => issue.message),
      );
    }

    const parts = await this.prisma.examPart.findMany({
      where: { examId: id },
      select: { opensAt: true, closesAt: true },
    });
    const opensAt = new Date(
      Math.min(...parts.map((part) => part.opensAt.getTime())),
    );
    const closesAt = new Date(
      Math.max(...parts.map((part) => part.closesAt.getTime())),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id },
        data: { status: ExamStatus.SCHEDULED, opensAt, closesAt },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_SCHEDULED',
          resourceType: 'EXAM',
          resourceId: id,
          afterData: {
            status: ExamStatus.SCHEDULED,
            opensAt: opensAt.toISOString(),
            closesAt: closesAt.toISOString(),
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /**
   * 시험을 취소한다(기획안 §14.1·D-31).
   *
   * 아직 아무도 응시를 시작하지 않았고 담당 강사 본인이면 강사도 취소할 수 있다.
   * 한 명이라도 응시를 시작했으면 실장·원장·관리자만 취소한다. 취소는 되돌릴 수
   * 없으며 기존 답안·제출·채점 기록은 보존한다.
   */
  async cancel(
    id: string,
    dto: CancelExamDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ExamResponse> {
    const existing = await this.loadForManage(id, actor);
    if (
      existing.status === ExamStatus.CANCELED ||
      existing.status === ExamStatus.COMPLETED
    ) {
      throw new ConflictException('이미 종결된 시험은 취소할 수 없습니다.');
    }

    const startedCount = await this.prisma.examAttempt.count({
      where: { examId: id, startedAt: { not: null } },
    });
    if (startedCount > 0 && !this.access.isPrivileged(actor.role)) {
      throw new ForbiddenException(
        '이미 응시가 시작된 시험은 실장·원장·관리자만 취소할 수 있습니다.',
      );
    }

    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException('취소 사유가 필요합니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.exam.update({
        where: { id },
        data: {
          status: ExamStatus.CANCELED,
          canceledAt: new Date(),
          canceledById: actor.id,
          cancelReason: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'EXAM_CANCELED',
          resourceType: 'EXAM',
          resourceId: id,
          beforeData: { status: existing.status },
          afterData: { status: ExamStatus.CANCELED },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /** 시험 존재·접근 권한(404로 숨김)을 확인하고 관리에 필요한 필드를 돌려준다. */
  private async loadForManage(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<{
    status: ExamStatus;
    scope: ExamScope;
    createdById: string | null;
    courseOfferingId: string;
    opensAt: Date;
    closesAt: Date;
    courseOfferingSubjectIds: string[];
  }> {
    const entity = await this.prisma.exam.findUnique({
      where: { id },
      select: {
        status: true,
        scope: true,
        createdById: true,
        courseOfferingId: true,
        opensAt: true,
        closesAt: true,
        courseOffering: { select: { instructorId: true } },
        subjects: {
          select: {
            courseOfferingSubjectId: true,
            courseOfferingSubject: { select: { subjectId: true } },
          },
        },
      },
    });
    if (!entity) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    const canAccess = await this.access.canManageExam(actor, {
      courseOfferingInstructorId: entity.courseOffering.instructorId,
      createdById: entity.createdById,
      subjectIds: entity.subjects.map(
        (link) => link.courseOfferingSubject.subjectId,
      ),
    });
    if (!canAccess) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    return {
      status: entity.status,
      scope: entity.scope,
      createdById: entity.createdById,
      courseOfferingId: entity.courseOfferingId,
      opensAt: entity.opensAt,
      closesAt: entity.closesAt,
      courseOfferingSubjectIds: entity.subjects.map(
        (link) => link.courseOfferingSubjectId,
      ),
    };
  }

  private assertDraft(status: ExamStatus): void {
    if (status !== ExamStatus.DRAFT) {
      throw new ConflictException('초안 상태의 시험만 수정할 수 있습니다.');
    }
  }

  /** 세부 과목 식별자 목록을 시험의 개설 강의에 해당하는 과목 연결로 변환한다. */
  private async resolveCourseOfferingSubjects(
    courseOfferingId: string,
    subjectIds: string[],
  ): Promise<string[]> {
    const unique = [...new Set(subjectIds)];
    if (unique.length === 0) {
      return [];
    }

    const rows = await this.prisma.courseOfferingSubject.findMany({
      where: { courseOfferingId, subjectId: { in: unique } },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException(
        '시험의 개설 강의에 포함되지 않은 과목이 있습니다.',
      );
    }

    return rows.map((row) => row.id);
  }

  private async assertClassesInCourseOffering(
    courseOfferingId: string,
    classIds: string[],
  ): Promise<void> {
    const unique = [...new Set(classIds)];
    if (unique.length === 0) {
      return;
    }

    const links = await this.prisma.classProgram.findMany({
      where: { courseOfferingId, classId: { in: unique } },
      select: { classId: true },
    });
    if (links.length !== unique.length) {
      throw new BadRequestException(
        '시험의 개설 강의에 속하지 않은 반이 있습니다.',
      );
    }
  }

  /**
   * 파트 유형별 필드 배타 규칙(1·2단계 CHECK 제약과 동일)을 검증하고 저장할 값을
   * 확정한다. 필기 파트는 제한 시간만, 실기 파트는 파일 제한만 가진다.
   */
  private buildPartData(
    type: ExamPartType,
    dto: UpsertExamPartDto,
  ): PartWriteData {
    if (dto.passScore > dto.totalScore) {
      throw new BadRequestException('합격 점수는 총점보다 클 수 없습니다.');
    }

    const opensAt = new Date(dto.opensAt);
    const closesAt = new Date(dto.closesAt);
    if (opensAt >= closesAt) {
      throw new BadRequestException(
        '파트 시작 시각은 종료 시각보다 앞서야 합니다.',
      );
    }

    const common = {
      totalScore: dto.totalScore,
      passScore: dto.passScore,
      opensAt,
      closesAt,
      instructions: dto.instructions?.trim() || null,
    };

    if (type === ExamPartType.WRITTEN) {
      if (
        dto.minFiles !== undefined ||
        dto.maxFiles !== undefined ||
        dto.maxTotalSizeBytes !== undefined
      ) {
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
      // 파일당 최대 크기는 클라이언트 입력과 무관하게 5MiB로 고정한다(D-49).
      maxFileSizeBytes: PRACTICAL_FILE_SIZE_BYTES,
      maxTotalSizeBytes,
    };
  }

  private toResponse(entity: ExamWithRelations): ExamResponse {
    return {
      id: entity.id,
      courseOfferingId: entity.courseOfferingId,
      courseOfferingName: entity.courseOffering.name,
      sourceTemplateId: entity.sourceTemplateId,
      sourceExamId: entity.sourceExamId,
      title: entity.title,
      description: entity.description,
      scope: entity.scope,
      stage: entity.stage,
      status: entity.status,
      opensAt: entity.opensAt.toISOString(),
      closesAt: entity.closesAt.toISOString(),
      createdById: entity.createdById,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      subjects: entity.subjects.map((link) => ({
        courseOfferingSubjectId: link.courseOfferingSubjectId,
        subjectId: link.courseOfferingSubject.subject.id,
        name: link.courseOfferingSubject.subject.name,
        active: link.courseOfferingSubject.subject.active,
      })),
      classTargets: entity.classTargets.map((link) => ({
        classId: link.classId,
        name: link.class.name,
      })),
      parts: entity.parts.map((part) => ({
        id: part.id,
        type: part.type,
        totalScore: Number(part.totalScore),
        passScore: Number(part.passScore),
        opensAt: part.opensAt.toISOString(),
        closesAt: part.closesAt.toISOString(),
        durationMinutes: part.durationMinutes,
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
