import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import request from 'supertest';
import { UserStatus } from '../src/generated/prisma/enums';
import {
  asUser,
  bootstrapTestApp,
  login,
  resetDb,
  seedCore,
  TEST_PASSWORD,
  type TestContext,
} from './helpers';

const DEVICE = '11111111-1111-4111-8111-111111111111';

describe('인증·권한 (기획안 §2·§3·§6.4·D-40~D-43, §15.3)', () => {
  let ctx: TestContext;
  let seeded: Awaited<ReturnType<typeof seedCore>>;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    seeded = await seedCore(ctx.prisma);
  });

  describe('로그인', () => {
    it('아이디·비밀번호가 맞으면 토큰을 준다', async () => {
      const res = await request(ctx.http())
        .post('/auth/login')
        .send({
          loginId: 'manager',
          password: TEST_PASSWORD,
          deviceIdentifier: DEVICE,
        })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({
        loginId: 'manager',
        role: 'MANAGER',
      });
    });

    it('비밀번호가 틀리면 401', async () => {
      await request(ctx.http())
        .post('/auth/login')
        .send({
          loginId: 'manager',
          password: 'wrong-pw-123',
          deviceIdentifier: DEVICE,
        })
        .expect(401);
    });

    it('5회 연속 실패하면 잠기고, 맞는 비밀번호도 막힌다', async () => {
      for (let i = 0; i < 5; i += 1) {
        await request(ctx.http()).post('/auth/login').send({
          loginId: 'manager',
          password: 'wrong-pw-123',
          deviceIdentifier: DEVICE,
        });
      }
      const res = await request(ctx.http()).post('/auth/login').send({
        loginId: 'manager',
        password: TEST_PASSWORD,
        deviceIdentifier: DEVICE,
      });
      expect(res.status).toBe(401);
    });

    it('없는 계정은 401 (계정 존재 여부를 노출하지 않는다)', async () => {
      await request(ctx.http())
        .post('/auth/login')
        .send({
          loginId: 'ghost',
          password: TEST_PASSWORD,
          deviceIdentifier: DEVICE,
        })
        .expect(401);
    });
  });

  describe('세션·토큰', () => {
    it('GET /auth/me 는 현재 사용자를 돌려준다', async () => {
      const { accessToken } = await login(ctx, 'inst1');
      const res = await asUser(ctx, accessToken).get('/auth/me').expect(200);
      expect(res.body).toMatchObject({ loginId: 'inst1', role: 'INSTRUCTOR' });
    });

    it('토큰 없이 보호된 경로는 401', async () => {
      await request(ctx.http()).get('/auth/me').expect(401);
    });

    it('학생은 동시 1기기 — 다른 기기 로그인 시 기존 세션이 끊긴다', async () => {
      const first = await request(ctx.http()).post('/auth/login').send({
        loginId: 'stu1',
        password: TEST_PASSWORD,
        deviceIdentifier: '22222222-2222-4222-8222-222222222222',
      });
      await request(ctx.http()).post('/auth/login').send({
        loginId: 'stu1',
        password: TEST_PASSWORD,
        deviceIdentifier: '33333333-3333-4333-8333-333333333333',
      });
      // 첫 기기 토큰은 이제 무효
      await asUser(ctx, first.body.accessToken).get('/auth/me').expect(401);
    });

    it('비밀번호 변경 시 기존 세션이 모두 끊긴다', async () => {
      const { accessToken, refreshToken } = await login(ctx, 'inst1');
      await request(ctx.http())
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: TEST_PASSWORD,
          newPassword: 'brand-new-pw-99',
        })
        .expect(204);
      await asUser(ctx, accessToken).get('/auth/me').expect(401);
      await request(ctx.http())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe('역할 가드', () => {
    it('학생이 스태프 전용 경로를 부르면 403', async () => {
      const { accessToken } = await login(ctx, 'stu1');
      await asUser(ctx, accessToken).get('/users').expect(403);
    });

    it('관리자는 수업 취소를 직접 못 한다 (D-38) — 라우트 가드에서 403', async () => {
      const { accessToken } = await login(ctx, 'admin');
      await asUser(ctx, accessToken)
        .post(`/classes/${DEVICE}/sessions/${DEVICE}/cancel`)
        .send({ reason: '테스트' })
        .expect(403);
    });
  });

  describe('회원가입 (§3)', () => {
    const base = {
      loginId: 'newbie',
      password: 'signup-pw-1234',
      name: '신입',
      phone: '01011112222',
      birthDate: '1990-03-03',
      gender: 'MALE',
      isMinorAtSignup: false,
    };

    it('성인은 보호자 정보 없이 가입되고 PENDING_APPROVAL 이다', async () => {
      const res = await request(ctx.http())
        .post('/auth/signup')
        .send({ ...base, agreedTermsDocumentIds: seeded.termsIds })
        .expect(201);
      expect(res.body.status).toBe(UserStatus.PENDING_APPROVAL);
    });

    it('생년월일이 미성년인데 클라이언트가 성인이라 해도 보호자 정보를 요구한다', async () => {
      await request(ctx.http())
        .post('/auth/signup')
        .send({
          ...base,
          birthDate: '2015-01-01',
          isMinorAtSignup: false,
          agreedTermsDocumentIds: seeded.termsIds,
        })
        .expect(400);
    });

    it('필수 약관을 모두 동의하지 않으면 400', async () => {
      await request(ctx.http())
        .post('/auth/signup')
        .send({ ...base, agreedTermsDocumentIds: [seeded.termsIds[0]] })
        .expect(400);
    });

    it('이미 쓰는 로그인 아이디는 409', async () => {
      await request(ctx.http())
        .post('/auth/signup')
        .send({
          ...base,
          loginId: 'manager',
          agreedTermsDocumentIds: seeded.termsIds,
        })
        .expect(409);
    });
  });

  describe('필수 약관 재동의 제한 흐름 (D-43)', () => {
    it('미동의 필수 약관이 있으면 제한 토큰을 주고, 동의 후 정식 세션을 발급한다', async () => {
      // 새 필수 약관 버전을 시행 → inst1 은 미동의
      const newDoc = await ctx.prisma.termsDocument.create({
        data: {
          type: '부가약관',
          version: '1.0',
          title: '부가약관',
          content: '본문',
          required: true,
          effectiveAt: new Date('2020-01-01'),
          active: true,
        },
        select: { id: true },
      });

      const res = await request(ctx.http())
        .post('/auth/login')
        .send({
          loginId: 'inst1',
          password: TEST_PASSWORD,
          deviceIdentifier: DEVICE,
        })
        .expect(200);
      expect(res.body.pendingConsent).toBe(true);
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.consentToken).toEqual(expect.any(String));
      expect(res.body.pendingTerms.map((t: { id: string }) => t.id)).toContain(
        newDoc.id,
      );

      const consentToken = res.body.consentToken as string;

      // 제한 토큰으로 다른 경로는 막힌다
      await request(ctx.http())
        .get('/auth/me')
        .set('Authorization', `Bearer ${consentToken}`)
        .expect(403);

      // 동의하면 정식 세션
      const done = await request(ctx.http())
        .post('/auth/consent')
        .set('Authorization', `Bearer ${consentToken}`)
        .send({
          agreedTermsDocumentIds: [newDoc.id],
          deviceIdentifier: DEVICE,
        })
        .expect(200);
      expect(done.body.accessToken).toEqual(expect.any(String));

      // 이제 정상 로그인
      const relog = await request(ctx.http()).post('/auth/login').send({
        loginId: 'inst1',
        password: TEST_PASSWORD,
        deviceIdentifier: DEVICE,
      });
      expect(relog.body.pendingConsent).toBeUndefined();
      expect(relog.body.accessToken).toEqual(expect.any(String));
    });
  });
});
