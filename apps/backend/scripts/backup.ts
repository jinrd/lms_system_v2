/**
 * PostgreSQL 논리 백업을 만들고 결과를 `backup_runs`에 기록한다(기획안 §14.5·§21.3).
 *
 * 실제 스케줄링은 운영 환경의 cron이 맡는다. cron이 하루 1회 이 스크립트를
 * 호출하면 되고, 오프사이트 복제·암호화·버킷 버전 관리는 스토리지 계층의 몫이다.
 * 이 스크립트는 덤프 파일을 `BACKUP_DIR`(기본 `./backups`)에 만들고 크기·체크섬과
 * 성공/실패 상태만 DB와 `system_logs`에 남긴다.
 *
 *   pnpm --filter @lms/backend backup
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const execFileAsync = promisify(execFile);

const rawDatabaseUrl = process.env.DATABASE_URL;
if (!rawDatabaseUrl) {
  throw new Error('DATABASE_URL 환경변수가 필요합니다.');
}

/**
 * Prisma 전용 쿼리 파라미터(`schema`, `connection_limit` 등)는 libpq가 이해하지
 * 못해 pg_dump가 거부한다. 접속에 필요한 파라미터만 남긴다.
 */
function toLibpqUrl(url: string): string {
  const parsed = new URL(url);
  const keep = new Set(['sslmode', 'sslrootcert', 'host', 'port', 'options']);
  for (const key of [...parsed.searchParams.keys()]) {
    if (!keep.has(key)) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

const databaseUrl = toLibpqUrl(rawDatabaseUrl);
const prismaDatabaseUrl = rawDatabaseUrl;

const BACKUP_DIR = resolve(process.env.BACKUP_DIR ?? './backups');
/** §14.5의 최근 3개월 보관 기준을 대략 덮는 하한이다. 계층별 정리는 스토리지 몫. */
const RETENTION_DAYS = 92;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: prismaDatabaseUrl }),
});

async function sha256(path: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('error', rejectPromise)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolvePromise(hash.digest('hex')));
  });
}

async function recordSystemLog(
  level: 'INFO' | 'ERROR',
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.systemLog.create({
    data: { level, message, route: 'job:BACKUP', metadata },
  });
}

async function main(): Promise<void> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const filePath = resolve(BACKUP_DIR, `lms-${stamp}.dump`);

  const run = await prisma.backupRun.create({
    data: { startedAt, status: 'RUNNING' },
  });

  try {
    // -Fc: 압축된 커스텀 포맷. 복원은 pg_restore 로 한다.
    await execFileAsync('pg_dump', [databaseUrl, '-Fc', '-f', filePath], {
      maxBuffer: 1024 * 1024 * 64,
    });

    const { size } = await stat(filePath);
    const checksum = await sha256(filePath);
    const retentionUntil = new Date(
      startedAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'SUCCESS',
        storageKey: filePath,
        sizeBytes: BigInt(size),
        checksum,
        retentionUntil,
      },
    });
    await recordSystemLog('INFO', '데이터베이스 백업 성공', {
      backupRunId: run.id,
      sizeBytes: size,
      storageKey: filePath,
    });
    console.log(`백업 성공: ${filePath} (${size} bytes)`);
  } catch (error: unknown) {
    const messageText =
      error instanceof Error ? error.message : '알 수 없는 오류';
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILURE',
        errorMessage: messageText.slice(0, 2000),
      },
    });
    await recordSystemLog('ERROR', '데이터베이스 백업 실패', {
      backupRunId: run.id,
    });
    console.error(`백업 실패: ${messageText}`);
    process.exitCode = 1;
  }
}

void main().finally(() => prisma.$disconnect());
