import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { DataLifecycleService } from './data-lifecycle.service';
import { LifecycleRunQueryDto } from './dto/lifecycle-run-query.dto';

type LifecycleRunResponse = {
  id: string;
  jobType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  scannedCount: number;
  successCount: number;
  failureCount: number;
  lastCursor: string | null;
  errorSummary: string | null;
};

@Controller('admin/data-lifecycle')
@Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
export class DataLifecycleController {
  constructor(
    private readonly service: DataLifecycleService,
    private readonly prisma: PrismaService,
  ) {}

  /** 모든 생명주기 작업을 즉시 1회 실행한다. 관리자 전용. */
  @Post('run')
  @HttpCode(202)
  @Roles(UserRole.ADMIN)
  async run(): Promise<{ started: boolean }> {
    await this.service.runAll();
    return { started: true };
  }

  @Get('runs')
  async runs(
    @Query() query: LifecycleRunQueryDto,
  ): Promise<PaginatedResult<LifecycleRunResponse>> {
    const where = {
      ...(query.jobType ? { jobType: query.jobType } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.dataLifecycleRun.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.dataLifecycleRun.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => ({
        id: row.id,
        jobType: row.jobType,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        scannedCount: row.scannedCount,
        successCount: row.successCount,
        failureCount: row.failureCount,
        lastCursor: row.lastCursor,
        errorSummary: row.errorSummary,
      })),
      total,
      query,
    );
  }
}
