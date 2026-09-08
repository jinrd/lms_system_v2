/**
 * 데이터 생명주기 배치를 한 번 실행한다(기획안 §21.4·§23).
 *
 * 예전에는 서버 프로세스 안 `setInterval`(6시간)이 돌리고 모듈 init 마다 한 번씩
 * 더 돌려서, 재기동할 때마다 전체 재스캔이 일어나고 `data_lifecycle_run` 행이
 * 무더기로 쌓였다. 이제는 이 CLI 를 OS cron 이 하루 1회 호출한다.
 *
 *   pnpm --filter @lms/backend lifecycle
 *
 * 관리자 API(`POST /admin/data-lifecycle/run`)도 같은 `runAll()` 을 부른다.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { DataLifecycleService } from '../src/operations/data-lifecycle.service';
import { SystemLogsService } from '../src/operations/system-logs.service';
import { SettingsService } from '../src/settings/settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경변수가 필요합니다.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
}) as unknown as PrismaService;

async function main(): Promise<void> {
  const settings = new SettingsService(prisma);
  const systemLogs = new SystemLogsService(prisma);
  const service = new DataLifecycleService(prisma, settings, systemLogs);

  const summary = await service.runAll();
  console.log(JSON.stringify(summary, null, 2));

  const failed = summary.jobs.filter((job) => job.status === 'FAILURE');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void main().finally(() => void prisma.$disconnect());
