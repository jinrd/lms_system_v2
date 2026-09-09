/**
 * e2e 테스트 DB를 준비한다: 없으면 만들고, 최신 마이그레이션을 적용한다.
 * 개발·운영 DB와 분리된 별도 DB(`DATABASE_URL`)를 대상으로 한다.
 * `test:e2e` 스크립트가 jest 실행 전에 한 번 부른다.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL 환경변수가 필요합니다.');
  }

  const dbName = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    const exists = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`e2e DB 생성: ${dbName}`);
    }
  } finally {
    await admin.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
