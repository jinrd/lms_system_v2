import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BackupQueryDto } from './dto/backup-query.dto';
import { RecordRestoreTestDto } from './dto/record-restore-test.dto';

export type BackupRunResponse = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  storageKey: string | null;
  sizeBytes: string | null;
  checksum: string | null;
  retentionUntil: string | null;
  errorMessage: string | null;
  restoreTestedAt: string | null;
  restoreTestResult: string | null;
};

/**
 * 데이터베이스 백업 실행 이력 조회다(기획안 §14.5·§21.3).
 *
 * 실제 덤프는 운영 cron이 `scripts/backup.ts`로 만들고 결과 행을 남긴다. 이
 * 서비스는 그 이력을 읽고, 별도 환경에서 수행한 복구 테스트 결과를 기록한다.
 */
@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: BackupQueryDto,
  ): Promise<PaginatedResult<BackupRunResponse>> {
    const where: Prisma.BackupRunWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.from || query.to) {
      where.startedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.backupRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.backupRun.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async recordRestoreTest(
    id: string,
    dto: RecordRestoreTestDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<BackupRunResponse> {
    const existing = await this.prisma.backupRun.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('백업 실행 기록을 찾을 수 없습니다.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.backupRun.update({
        where: { id },
        data: {
          restoreTestedAt: new Date(),
          restoreTestResult: dto.result,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'BACKUP_RESTORE_TESTED',
          resourceType: 'BACKUP_RUN',
          resourceId: id,
          afterData: { result: dto.result },
          ipAddress,
          result: 'SUCCESS',
        },
      });
      return row;
    });

    return this.toResponse(updated);
  }

  private toResponse(row: {
    id: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    storageKey: string | null;
    sizeBytes: bigint | null;
    checksum: string | null;
    retentionUntil: Date | null;
    errorMessage: string | null;
    restoreTestedAt: Date | null;
    restoreTestResult: string | null;
  }): BackupRunResponse {
    return {
      id: row.id,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      storageKey: row.storageKey,
      sizeBytes: row.sizeBytes?.toString() ?? null,
      checksum: row.checksum,
      retentionUntil: row.retentionUntil?.toISOString() ?? null,
      errorMessage: row.errorMessage,
      restoreTestedAt: row.restoreTestedAt?.toISOString() ?? null,
      restoreTestResult: row.restoreTestResult,
    };
  }
}
