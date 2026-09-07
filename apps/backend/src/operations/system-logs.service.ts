import { Injectable, Logger } from '@nestjs/common';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogQueryDto } from './dto/system-log-query.dto';

export type SystemLogLevel = 'INFO' | 'WARN' | 'ERROR';

export type SystemLogInput = {
  level: SystemLogLevel;
  message: string;
  errorCode?: string | null;
  stack?: string | null;
  userId?: string | null;
  route?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type SystemLogResponse = {
  id: string;
  level: string;
  message: string;
  errorCode: string | null;
  stack: string | null;
  userId: string | null;
  route: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
};

/**
 * 서버 오류와 운영 이벤트 로그다(기획안 §14.4·§21.2).
 *
 * 500·미처리 예외는 전역 예외 필터가, 배치 작업의 시작·실패는 생명주기 러너가
 * `record`로 남긴다. 조회는 실장·원장·관리자만 한다. 비밀번호·토큰·출석 원본
 * 코드·서명 URL 같은 민감값은 호출부가 message·metadata에 넣지 않는다.
 */
@Injectable()
export class SystemLogsService {
  private readonly logger = new Logger(SystemLogsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 로그 1건을 적재한다. 적재 실패가 원래 요청·작업을 막지 않도록 삼킨다. */
  async record(input: SystemLogInput): Promise<void> {
    try {
      await this.prisma.systemLog.create({
        data: {
          level: input.level,
          message: input.message.slice(0, 20000),
          errorCode: input.errorCode ?? null,
          stack: input.stack ?? null,
          userId: input.userId ?? null,
          route: input.route ?? null,
          requestId: input.requestId ?? null,
          metadata: input.metadata ?? undefined,
        },
      });
    } catch (error: unknown) {
      this.logger.error(
        '시스템 로그 적재에 실패했습니다.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(
    query: SystemLogQueryDto,
  ): Promise<PaginatedResult<SystemLogResponse>> {
    const where: Prisma.SystemLogWhereInput = {};
    if (query.level) {
      where.level = query.level;
    }
    if (query.errorCode) {
      where.errorCode = query.errorCode;
    }
    if (query.requestId) {
      where.requestId = query.requestId;
    }
    if (query.route) {
      where.route = { contains: query.route };
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        level: row.level,
        message: row.message,
        errorCode: row.errorCode,
        stack: row.stack,
        userId: row.userId,
        route: row.route,
        requestId: row.requestId,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
}
