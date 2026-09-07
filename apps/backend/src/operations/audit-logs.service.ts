import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { AuditResult, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export type AuditLogResponse = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  result: AuditResult;
  errorCode: string | null;
  ipAddress: string | null;
  requestId: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
};

/**
 * 감사 로그 조회다(기획안 §14.1·§21.1). 로그는 각 업무 서비스가 트랜잭션 안에서
 * 기록하고, 이 서비스는 읽기만 한다. 조회는 실장·원장·관리자만 할 수 있다.
 * 비밀번호·토큰·출석 원본 코드·서명 URL은 애초에 저장되지 않는다.
 */
@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLogResponse>> {
    const where: Prisma.AuditLogWhereInput = {};

    if (query.actorId) {
      where.actorId = query.actorId;
    }
    if (query.actorRole) {
      where.actorRole = query.actorRole;
    }
    if (query.action) {
      where.action = query.action;
    }
    if (query.resourceType) {
      where.resourceType = query.resourceType;
    }
    if (query.resourceId) {
      where.resourceId = query.resourceId;
    }
    if (query.result) {
      where.result = query.result;
    }
    if (query.requestId) {
      where.requestId = query.requestId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actor?.name ?? null,
        actorRole: row.actorRole,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        reason: row.reason,
        result: row.result,
        errorCode: row.errorCode,
        ipAddress: row.ipAddress,
        requestId: row.requestId,
        beforeData: row.beforeData ?? null,
        afterData: row.afterData ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }
}
