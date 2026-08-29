import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { UserRole, UserStatus } from '../src/generated/prisma/enums';

function getRequiredEnvironmentVariable(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }

  return value;
}

const databaseUrl = getRequiredEnvironmentVariable('DATABASE_URL');
const loginId = getRequiredEnvironmentVariable('INITIAL_ADMIN_LOGIN_ID')
  .trim()
  .toLowerCase();
const password = getRequiredEnvironmentVariable('INITIAL_ADMIN_PASSWORD');
const name = getRequiredEnvironmentVariable('INITIAL_ADMIN_NAME').trim();

if (!/^[a-z0-9._-]{4,30}$/.test(loginId)) {
  throw new Error('INITIAL_ADMIN_LOGIN_ID 형식이 올바르지 않습니다.');
}

if (password.length < 8 || password.length > 64) {
  throw new Error('INITIAL_ADMIN_PASSWORD는 8~64자여야 합니다.');
}

if (password.toLowerCase() === loginId) {
  throw new Error('관리자 비밀번호는 로그인 아이디와 달라야 합니다.');
}

if (!name) {
  throw new Error('INITIAL_ADMIN_NAME이 필요합니다.');
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const prisma = new PrismaClient({ adapter });

async function seed(): Promise<void> {
  const existingAdmin = await prisma.user.findFirst({
    where: {
      loginId,
      status: {
        not: UserStatus.DELETED,
      },
    },
  });

  if (existingAdmin) {
    console.log('초기 관리자 계정이 이미 존재합니다.');
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  await prisma.user.create({
    data: {
      loginId,
      passwordHash,
      name,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      passwordChangedAt: new Date(),
    },
  });

  console.log('초기 관리자 계정을 생성했습니다.');
}

seed()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'seed 실행에 실패했습니다.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
