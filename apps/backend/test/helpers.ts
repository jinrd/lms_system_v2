import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Gender, UserRole, UserStatus } from '../src/generated/prisma/enums';

export type TestContext = {
  app: INestApplication<App>;
  prisma: PrismaService;
  http: () => App;
};

/**
 * 운영과 같은 파이프·필터·미들웨어를 붙인 Nest 앱을 띄운다. 스펙 파일에서
 * `beforeAll` 로 한 번 만들고 `afterAll` 로 닫는다.
 */
export async function bootstrapTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<App>();
  // main.ts 와 동일한 전역 파이프. 필터·가드·request-id 미들웨어는 AppModule 안에서
  // APP_FILTER / APP_GUARD / configure() 로 이미 등록되므로 여기서 또 붙이지 않는다.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => app.getHttpServer() };
}

/** _prisma_migrations 를 뺀 모든 테이블을 비운다. 각 테스트 앞에서 호출한다. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  if (list.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  }
}

export const TEST_PASSWORD = 'test-password-1234';

export type SeededUser = { id: string; loginId: string; role: UserRole };

/**
 * 스태프·강사·학생 기본 계정과 필수 약관을 만든다. 대부분의 스펙이 이걸로
 * 시작한다. 반환값의 키는 loginId 다.
 */
export async function seedCore(prisma: PrismaService): Promise<{
  users: Record<string, SeededUser>;
  termsIds: string[];
  passwordHash: string;
}> {
  const passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
  });

  const defs: Array<{ loginId: string; role: UserRole; minor?: boolean }> = [
    { loginId: 'admin', role: UserRole.ADMIN },
    { loginId: 'manager', role: UserRole.MANAGER },
    { loginId: 'principal', role: UserRole.PRINCIPAL },
    { loginId: 'inst1', role: UserRole.INSTRUCTOR },
    { loginId: 'inst2', role: UserRole.INSTRUCTOR },
    { loginId: 'stu1', role: UserRole.STUDENT },
    { loginId: 'stu2', role: UserRole.STUDENT },
    { loginId: 'stu3', role: UserRole.STUDENT },
  ];

  const users: Record<string, SeededUser> = {};
  for (const def of defs) {
    const created = await prisma.user.create({
      data: {
        loginId: def.loginId,
        passwordHash,
        name: def.loginId.toUpperCase(),
        phone: `010${String(1000000 + defs.indexOf(def)).slice(-7)}`,
        role: def.role,
        status: UserStatus.ACTIVE,
        mustChangePassword: false,
        ...(def.role === UserRole.STUDENT
          ? {
              birthDate: new Date('1998-05-05'),
              gender: Gender.OTHER,
              studentProfile: { create: { isMinorAtSignup: false } },
            }
          : {}),
      },
      select: { id: true, loginId: true, role: true },
    });
    users[def.loginId] = { ...created, loginId: created.loginId! };
  }

  const termsIds: string[] = [];
  for (const type of ['이용약관', '개인정보']) {
    const doc = await prisma.termsDocument.create({
      data: {
        type,
        version: '1.0',
        title: `${type} v1`,
        content: `${type} 본문`,
        required: true,
        effectiveAt: new Date('2020-01-01'),
        active: true,
      },
      select: { id: true },
    });
    termsIds.push(doc.id);
  }

  // 시드 계정은 기본 로그인이 되도록 현재 필수 약관에 이미 동의한 상태로 둔다.
  // 재동의 흐름 테스트는 스펙에서 새 약관 버전을 별도로 시행한다.
  await prisma.termsConsent.createMany({
    data: Object.values(users).flatMap((u) =>
      termsIds.map((termsDocumentId) => ({
        userId: u.id,
        termsDocumentId,
        agreed: true,
        agreedAt: new Date(),
      })),
    ),
  });

  return { users, termsIds, passwordHash };
}

/** loginId/password 로 로그인해 accessToken·refreshToken 을 얻는다. */
export async function login(
  ctx: TestContext,
  loginId: string,
  password: string = TEST_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string; body: unknown }> {
  const res = await request(ctx.http()).post('/auth/login').send({
    loginId,
    password,
    deviceIdentifier: '11111111-1111-4111-8111-111111111111',
    deviceName: 'jest',
  });
  return {
    accessToken: res.body?.accessToken,
    refreshToken: res.body?.refreshToken,
    body: res.body,
  };
}

/** Authorization 헤더를 붙인 supertest 요청 빌더. */
export function asUser(ctx: TestContext, accessToken: string) {
  const agent = request(ctx.http());
  const bearer = { Authorization: `Bearer ${accessToken}` };
  return {
    get: (url: string) => agent.get(url).set(bearer),
    post: (url: string) => agent.post(url).set(bearer),
    patch: (url: string) => agent.patch(url).set(bearer),
    put: (url: string) => agent.put(url).set(bearer),
    delete: (url: string) => agent.delete(url).set(bearer),
  };
}
