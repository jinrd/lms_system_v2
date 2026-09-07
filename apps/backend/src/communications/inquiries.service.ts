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
  InquiryStatus,
  InquiryType,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsAccessService } from './communications-access.service';
import { CreateInquiryReplyDto } from './dto/create-inquiry-reply.dto';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiryQueryDto } from './dto/inquiry-query.dto';

export type InquiryReplyResponse = {
  id: string;
  authorId: string | null;
  content: string;
  createdAt: string;
};

export type InquiryDetail = {
  id: string;
  type: InquiryType;
  classId: string | null;
  className: string | null;
  authorId: string;
  title: string;
  content: string;
  status: InquiryStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  replies: InquiryReplyResponse[];
};

export type InquiryListItem = Omit<InquiryDetail, 'replies' | 'content'> & {
  replyCount: number;
};

/** 답변·종료 권한 판정에 쓰는 문의의 최소 정보다. */
type InquiryCore = {
  type: InquiryType;
  classId: string | null;
  status: InquiryStatus;
  authorId: string;
};

@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CommunicationsAccessService,
  ) {}

  async create(
    dto: CreateInquiryDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<InquiryDetail> {
    if (dto.type === InquiryType.CLASS) {
      if (!dto.classId) {
        throw new BadRequestException('반 관련 문의는 대상 반이 필요합니다.');
      }
      const studentClasses = await this.access.getStudentClassIds(actor.id);
      if (!studentClasses.has(dto.classId)) {
        throw new ForbiddenException(
          '본인이 수강 중인 반에만 반 관련 문의를 올릴 수 있습니다.',
        );
      }
    } else if (dto.classId) {
      throw new BadRequestException(
        '일반 문의에는 대상 반을 지정할 수 없습니다.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const inquiry = await tx.inquiry.create({
        data: {
          authorId: actor.id,
          type: dto.type,
          classId: dto.type === InquiryType.CLASS ? dto.classId : null,
          title: dto.title.trim(),
          content: dto.content.trim(),
          status: InquiryStatus.RECEIVED,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'INQUIRY_CREATED',
          resourceType: 'INQUIRY',
          resourceId: inquiry.id,
          afterData: { type: dto.type, classId: inquiry.classId },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return inquiry.id;
    });

    return this.getById(created, actor);
  }

  async list(
    query: InquiryQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<InquiryListItem>> {
    const where: Prisma.InquiryWhereInput = {};
    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.classId) {
      where.classId = query.classId;
    }

    if (actor.role === UserRole.STUDENT) {
      where.authorId = actor.id;
    } else if (!this.access.isPrivileged(actor.role)) {
      // 강사: 담당 반의 반 관련 문의만.
      const classIds = [...(await this.access.getInstructorClassIds(actor.id))];
      where.type = InquiryType.CLASS;
      where.classId =
        query.classId && classIds.includes(query.classId)
          ? query.classId
          : query.classId
            ? { in: [] }
            : { in: classIds };
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.inquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          class: { select: { name: true } },
          _count: { select: { replies: true } },
        },
      });
      const total = await tx.inquiry.count({ where });
      return [rows, total] as const;
    });

    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        classId: row.classId,
        className: row.class?.name ?? null,
        authorId: row.authorId,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        closedAt: row.closedAt?.toISOString() ?? null,
        replyCount: row._count.replies,
      })),
      total,
      query,
    );
  }

  async getById(id: string, actor: AuthenticatedUser): Promise<InquiryDetail> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        class: { select: { name: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            authorId: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });
    if (!inquiry || !(await this.canView(actor, inquiry))) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }

    return {
      id: inquiry.id,
      type: inquiry.type,
      classId: inquiry.classId,
      className: inquiry.class?.name ?? null,
      authorId: inquiry.authorId,
      title: inquiry.title,
      content: inquiry.content,
      status: inquiry.status,
      createdAt: inquiry.createdAt.toISOString(),
      updatedAt: inquiry.updatedAt.toISOString(),
      closedAt: inquiry.closedAt?.toISOString() ?? null,
      replies: inquiry.replies.map((reply) => ({
        id: reply.id,
        authorId: reply.authorId,
        content: reply.content,
        createdAt: reply.createdAt.toISOString(),
      })),
    };
  }

  /**
   * 답글을 단다. 종료된 문의는 거부한다(§19.2).
   *
   * 상태 전이(§31): 답변 권한자의 답글은 `ANSWERED`로, 학생(작성자)의 답글은
   * `RECEIVED`/`ANSWERED`에서 `IN_PROGRESS`로 바꾼다.
   */
  async addReply(
    id: string,
    dto: CreateInquiryReplyDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<InquiryDetail> {
    const inquiry = await this.load(id);
    if (inquiry.status === InquiryStatus.CLOSED) {
      throw new ConflictException('종료된 문의에는 답글을 달 수 없습니다.');
    }

    const isAuthor = actor.id === inquiry.authorId;
    const canAnswer = await this.canAnswer(actor, inquiry);
    if (!isAuthor && !canAnswer) {
      throw new ForbiddenException('이 문의에 답글을 달 권한이 없습니다.');
    }

    const nextStatus = this.nextStatusAfterReply(
      inquiry.status,
      canAnswer && !isAuthor,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.inquiryReply.create({
        data: {
          inquiryId: id,
          authorId: actor.id,
          content: dto.content.trim(),
        },
      });
      if (nextStatus !== inquiry.status) {
        await tx.inquiry.update({
          where: { id },
          data: { status: nextStatus },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'INQUIRY_REPLIED',
          resourceType: 'INQUIRY',
          resourceId: id,
          afterData: { status: nextStatus, byAnswerer: canAnswer && !isAuthor },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /** 문의를 종료한다. CLASS = 담당 강사·실장 이상 / GENERAL = 실장 이상. */
  async close(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<InquiryDetail> {
    const inquiry = await this.load(id);
    if (inquiry.status === InquiryStatus.CLOSED) {
      throw new ConflictException('이미 종료된 문의입니다.');
    }
    if (!(await this.canAnswer(actor, inquiry))) {
      throw new ForbiddenException('이 문의를 종료할 권한이 없습니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inquiry.update({
        where: { id },
        data: { status: InquiryStatus.CLOSED, closedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'INQUIRY_CLOSED',
          resourceType: 'INQUIRY',
          resourceId: id,
          beforeData: { status: inquiry.status },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  private nextStatusAfterReply(
    current: InquiryStatus,
    byAnswerer: boolean,
  ): InquiryStatus {
    if (byAnswerer) {
      return InquiryStatus.ANSWERED;
    }
    if (
      current === InquiryStatus.RECEIVED ||
      current === InquiryStatus.ANSWERED
    ) {
      return InquiryStatus.IN_PROGRESS;
    }
    return current;
  }

  /**
   * 답변·종료 권한: 반 관련 문의는 담당 강사(교육과정 기준)와 실장·원장·관리자,
   * 일반 문의는 실장·원장·관리자만(§11·D-09).
   */
  private async canAnswer(
    actor: AuthenticatedUser,
    inquiry: InquiryCore,
  ): Promise<boolean> {
    if (this.access.isPrivileged(actor.role)) {
      return true;
    }
    if (
      actor.role === UserRole.INSTRUCTOR &&
      inquiry.type === InquiryType.CLASS &&
      inquiry.classId
    ) {
      const classIds = await this.access.getInstructorClassIds(actor.id);
      return classIds.has(inquiry.classId);
    }
    return false;
  }

  private async canView(
    actor: AuthenticatedUser,
    inquiry: InquiryCore,
  ): Promise<boolean> {
    if (actor.id === inquiry.authorId) {
      return true;
    }
    return this.canAnswer(actor, inquiry);
  }

  private async load(id: string): Promise<InquiryCore & { id: string }> {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        classId: true,
        status: true,
        authorId: true,
      },
    });
    if (!inquiry) {
      throw new NotFoundException('문의를 찾을 수 없습니다.');
    }
    return inquiry;
  }
}
