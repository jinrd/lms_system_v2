import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { NoticeScope, NoticeType, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsAccessService } from './communications-access.service';
import { MyNoticeQueryDto } from './dto/my-notice-query.dto';

export type MyNoticeListItem = {
  id: string;
  type: NoticeType;
  scope: NoticeScope;
  title: string;
  important: boolean;
  publishedFrom: string | null;
  publishedUntil: string | null;
  createdAt: string;
  isRead: boolean;
};

export type MyNoticeDetail = MyNoticeListItem & {
  content: string;
  readAt: string;
};

/**
 * 학생·강사가 본인에게 공개된 공지를 읽는 경로다(기획안 §10·§18.4·D-44).
 *
 * 대상은 역할로 갈린다. 학생은 `type = STUDENT` 공지(전체 또는 활성 수강 반이
 * 대상), 강사·실장·원장·관리자는 `type = INSTRUCTOR` 공지다. 목록 조회로는 읽음
 * 처리하지 않고, 상세 조회에서만 `notice_reads`를 최초 1회 기록한다.
 */
@Injectable()
export class NoticeReaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CommunicationsAccessService,
  ) {}

  async list(
    query: MyNoticeQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<MyNoticeListItem>> {
    const where = await this.visibleWhere(actor);
    if (query.important !== undefined) {
      where.important = query.important;
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.notice.findMany({
        where,
        orderBy: [{ important: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          type: true,
          scope: true,
          title: true,
          important: true,
          publishedFrom: true,
          publishedUntil: true,
          createdAt: true,
        },
      });
      const total = await tx.notice.count({ where });
      return [rows, total] as const;
    });

    const readIds = await this.readNoticeIds(
      actor.id,
      rows.map((row) => row.id),
    );

    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        scope: row.scope,
        title: row.title,
        important: row.important,
        publishedFrom: row.publishedFrom?.toISOString() ?? null,
        publishedUntil: row.publishedUntil?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        isRead: readIds.has(row.id),
      })),
      total,
      query,
    );
  }

  /**
   * 상세 조회. 권한·대상·게시 기간 검증을 통과하면 `notice_reads`를 UPSERT한다.
   * 이미 읽었으면 최초 열람 시각을 유지한다(§18.4).
   */
  async getById(id: string, actor: AuthenticatedUser): Promise<MyNoticeDetail> {
    const where = await this.visibleWhere(actor);
    const notice = await this.prisma.notice.findFirst({
      where: { ...where, id },
      select: {
        id: true,
        type: true,
        scope: true,
        title: true,
        content: true,
        important: true,
        publishedFrom: true,
        publishedUntil: true,
        createdAt: true,
      },
    });
    if (!notice) {
      throw new NotFoundException('공지를 찾을 수 없습니다.');
    }

    const now = new Date();
    const read = await this.prisma.noticeRead.upsert({
      where: { noticeId_userId: { noticeId: id, userId: actor.id } },
      create: { noticeId: id, userId: actor.id, readAt: now },
      update: {},
      select: { readAt: true },
    });

    return {
      id: notice.id,
      type: notice.type,
      scope: notice.scope,
      title: notice.title,
      content: notice.content,
      important: notice.important,
      publishedFrom: notice.publishedFrom?.toISOString() ?? null,
      publishedUntil: notice.publishedUntil?.toISOString() ?? null,
      createdAt: notice.createdAt.toISOString(),
      isRead: true,
      readAt: read.readAt.toISOString(),
    };
  }

  /** 현재 게시 중이고 내게 노출되는 공지 중 아직 읽지 않은 건수다(D-44). */
  async unreadCount(actor: AuthenticatedUser): Promise<{ count: number }> {
    const where = await this.visibleWhere(actor);
    const count = await this.prisma.notice.count({
      where: { ...where, reads: { none: { userId: actor.id } } },
    });
    return { count };
  }

  /** 역할별 대상 공지 + 게시 기간 필터를 만든다. */
  private async visibleWhere(
    actor: AuthenticatedUser,
  ): Promise<Prisma.NoticeWhereInput> {
    const now = new Date();
    const publishedNow: Prisma.NoticeWhereInput = {
      AND: [
        { OR: [{ publishedFrom: null }, { publishedFrom: { lte: now } }] },
        { OR: [{ publishedUntil: null }, { publishedUntil: { gte: now } }] },
      ],
    };

    if (actor.role === UserRole.STUDENT) {
      const classIds = [...(await this.access.getStudentClassIds(actor.id))];
      return {
        ...publishedNow,
        type: NoticeType.STUDENT,
        OR: [
          { scope: NoticeScope.ALL },
          {
            scope: NoticeScope.CLASSES,
            classTargets: { some: { classId: { in: classIds } } },
          },
        ],
      };
    }

    return { ...publishedNow, type: NoticeType.INSTRUCTOR };
  }

  private async readNoticeIds(
    userId: string,
    noticeIds: string[],
  ): Promise<Set<string>> {
    if (noticeIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.noticeRead.findMany({
      where: { userId, noticeId: { in: noticeIds } },
      select: { noticeId: true },
    });
    return new Set(rows.map((row) => row.noticeId));
  }
}
