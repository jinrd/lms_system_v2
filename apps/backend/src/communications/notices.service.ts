import {
  BadRequestException,
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
import { NoticeScope, NoticeType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsAccessService } from './communications-access.service';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { NoticeQueryDto } from './dto/notice-query.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';

export type NoticeResponse = {
  id: string;
  type: NoticeType;
  scope: NoticeScope;
  title: string;
  content: string;
  important: boolean;
  publishedFrom: string | null;
  publishedUntil: string | null;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
  classTargets: Array<{ classId: string; name: string }>;
};

const NOTICE_INCLUDE = {
  classTargets: {
    include: { class: { select: { id: true, name: true } } },
  },
} as const;

type NoticeWithTargets = Prisma.NoticeGetPayload<{
  include: typeof NOTICE_INCLUDE;
}>;

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CommunicationsAccessService,
  ) {}

  /** 관리 목록. 강사는 본인 작성분 또는 담당 반이 대상인 공지만 본다. */
  async list(
    query: NoticeQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<NoticeResponse>> {
    const where: Prisma.NoticeWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.scope) {
      where.scope = query.scope;
    }
    if (query.important !== undefined) {
      where.important = query.important;
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.title = { contains: keyword, mode: 'insensitive' };
    }

    if (!this.access.isPrivileged(actor.role)) {
      const classIds = [...(await this.access.getInstructorClassIds(actor.id))];
      where.OR = [
        { authorId: actor.id },
        { classTargets: { some: { classId: { in: classIds } } } },
      ];
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.notice.findMany({
        where,
        include: NOTICE_INCLUDE,
        orderBy: [{ important: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      });
      const total = await tx.notice.count({ where });
      return [rows, total] as const;
    });

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<NoticeResponse> {
    const entity = await this.prisma.notice.findUnique({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (!entity || !(await this.canManage(actor, entity))) {
      throw new NotFoundException('공지를 찾을 수 없습니다.');
    }
    return this.toResponse(entity);
  }

  async create(
    dto: CreateNoticeDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<NoticeResponse> {
    const classTargetIds =
      dto.scope === NoticeScope.CLASSES
        ? [...new Set(dto.classTargetIds ?? [])]
        : [];

    await this.assertCanWrite(actor, dto.type, dto.scope, classTargetIds);

    const publishedFrom = dto.publishedFrom
      ? new Date(dto.publishedFrom)
      : null;
    const publishedUntil = dto.publishedUntil
      ? new Date(dto.publishedUntil)
      : null;
    if (publishedFrom && publishedUntil && publishedFrom > publishedUntil) {
      throw new BadRequestException(
        '게시 시작 시각은 종료 시각보다 뒤일 수 없습니다.',
      );
    }

    if (classTargetIds.length > 0) {
      await this.assertClassesExist(classTargetIds);
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notice.create({
        data: {
          type: dto.type,
          scope: dto.scope,
          title: dto.title.trim(),
          content: dto.content.trim(),
          important: dto.important ?? false,
          publishedFrom,
          publishedUntil,
          authorId: actor.id,
          classTargets:
            classTargetIds.length > 0
              ? { create: classTargetIds.map((classId) => ({ classId })) }
              : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'NOTICE_CREATED',
          resourceType: 'NOTICE',
          resourceId: created.id,
          afterData: {
            type: dto.type,
            scope: dto.scope,
            classTargetIds,
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
    dto: UpdateNoticeDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<NoticeResponse> {
    const existing = await this.prisma.notice.findUnique({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (!existing || !(await this.canManage(actor, existing))) {
      throw new NotFoundException('공지를 찾을 수 없습니다.');
    }

    const nextFrom =
      dto.publishedFrom !== undefined
        ? dto.publishedFrom
          ? new Date(dto.publishedFrom)
          : null
        : existing.publishedFrom;
    const nextUntil =
      dto.publishedUntil !== undefined
        ? dto.publishedUntil
          ? new Date(dto.publishedUntil)
          : null
        : existing.publishedUntil;
    if (nextFrom && nextUntil && nextFrom > nextUntil) {
      throw new BadRequestException(
        '게시 시작 시각은 종료 시각보다 뒤일 수 없습니다.',
      );
    }

    let nextTargets: string[] | null = null;
    if (dto.classTargetIds !== undefined) {
      if (existing.scope !== NoticeScope.CLASSES) {
        throw new BadRequestException(
          '전체 범위 공지에는 대상 반을 지정할 수 없습니다.',
        );
      }
      nextTargets = [...new Set(dto.classTargetIds)];
      if (nextTargets.length === 0) {
        throw new BadRequestException(
          '특정 반 공지는 대상 반이 1개 이상이어야 합니다.',
        );
      }
      if (!this.access.isPrivileged(actor.role)) {
        const owned = await this.access.getInstructorClassIds(actor.id);
        if (!nextTargets.every((classId) => owned.has(classId))) {
          throw new ForbiddenException(
            '담당하지 않는 반은 공지 대상으로 지정할 수 없습니다.',
          );
        }
      }
      await this.assertClassesExist(nextTargets);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notice.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
          ...(dto.important !== undefined ? { important: dto.important } : {}),
          ...(dto.publishedFrom !== undefined
            ? { publishedFrom: nextFrom }
            : {}),
          ...(dto.publishedUntil !== undefined
            ? { publishedUntil: nextUntil }
            : {}),
        },
      });

      if (nextTargets !== null) {
        await tx.noticeClassTarget.deleteMany({ where: { noticeId: id } });
        await tx.noticeClassTarget.createMany({
          data: nextTargets.map((classId) => ({ noticeId: id, classId })),
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'NOTICE_UPDATED',
          resourceType: 'NOTICE',
          resourceId: id,
          afterData: { classTargetsChanged: nextTargets !== null },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<void> {
    const existing = await this.prisma.notice.findUnique({
      where: { id },
      include: NOTICE_INCLUDE,
    });
    if (!existing || !(await this.canManage(actor, existing))) {
      throw new NotFoundException('공지를 찾을 수 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notice.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'NOTICE_DELETED',
          resourceType: 'NOTICE',
          resourceId: id,
          beforeData: { type: existing.type, scope: existing.scope },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });
  }

  /**
   * 작성 규칙(§18.1·D-08)을 검증한다.
   *
   * - `INSTRUCTOR` 공지는 `scope = ALL`만, 실장·원장·관리자만.
   * - `STUDENT` + `ALL`(전체 학생 공지)도 실장·원장·관리자만.
   * - `STUDENT` + `CLASSES`는 강사가 본인 담당 반에만, 대상 반 1개 이상.
   */
  private async assertCanWrite(
    actor: AuthenticatedUser,
    type: NoticeType,
    scope: NoticeScope,
    classTargetIds: string[],
  ): Promise<void> {
    const privileged = this.access.isPrivileged(actor.role);

    if (type === NoticeType.INSTRUCTOR) {
      if (scope !== NoticeScope.ALL) {
        throw new BadRequestException('강사 공지는 전체 범위만 가능합니다.');
      }
      if (!privileged) {
        throw new ForbiddenException(
          '강사 공지는 실장·원장·관리자만 작성할 수 있습니다.',
        );
      }
      return;
    }

    // type === STUDENT
    if (scope === NoticeScope.ALL) {
      if (!privileged) {
        throw new ForbiddenException(
          '전체 학생 공지는 실장·원장·관리자만 작성할 수 있습니다.',
        );
      }
      return;
    }

    // STUDENT + CLASSES
    if (classTargetIds.length === 0) {
      throw new BadRequestException(
        '특정 반 공지는 대상 반이 1개 이상이어야 합니다.',
      );
    }
    if (!privileged) {
      const owned = await this.access.getInstructorClassIds(actor.id);
      if (!classTargetIds.every((classId) => owned.has(classId))) {
        throw new ForbiddenException(
          '담당하지 않는 반은 공지 대상으로 지정할 수 없습니다.',
        );
      }
    }
  }

  /** 강사가 이 공지를 관리(조회·수정·삭제)할 수 있는지. 실장 이상은 항상 가능. */
  private async canManage(
    actor: AuthenticatedUser,
    notice: NoticeWithTargets,
  ): Promise<boolean> {
    if (this.access.isPrivileged(actor.role)) {
      return true;
    }
    if (notice.authorId === actor.id) {
      return true;
    }
    if (notice.scope !== NoticeScope.CLASSES) {
      return false;
    }
    const owned = await this.access.getInstructorClassIds(actor.id);
    return notice.classTargets.some((target) => owned.has(target.classId));
  }

  private async assertClassesExist(classIds: string[]): Promise<void> {
    const found = await this.prisma.class.count({
      where: { id: { in: classIds }, archivedAt: null },
    });
    if (found !== classIds.length) {
      throw new BadRequestException(
        '존재하지 않거나 보관된 반이 대상에 포함되어 있습니다.',
      );
    }
  }

  private toResponse(entity: NoticeWithTargets): NoticeResponse {
    return {
      id: entity.id,
      type: entity.type,
      scope: entity.scope,
      title: entity.title,
      content: entity.content,
      important: entity.important,
      publishedFrom: entity.publishedFrom?.toISOString() ?? null,
      publishedUntil: entity.publishedUntil?.toISOString() ?? null,
      authorId: entity.authorId,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      classTargets: entity.classTargets.map((target) => ({
        classId: target.classId,
        name: target.class.name,
      })),
    };
  }
}
