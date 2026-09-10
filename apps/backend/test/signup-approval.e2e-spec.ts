import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import request from 'supertest';
import {
  asUser,
  bootstrapTestApp,
  login,
  resetDb,
  seedCore,
  type TestContext,
} from './helpers';

const DEVICE = '22222222-2222-4222-8222-222222222222';

/**
 * 공개 회원가입은 항상 학생 형태로 들어와 PENDING_APPROVAL이 되고, 승인자가
 * 역할을 정한다(기획안 §6.1 / D-18, 개선방향 회원가입 개편).
 */
describe('회원가입 승인·역할 부여 (기획안 §6.1·D-18, §15.3)', () => {
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

  const signupBase = {
    password: 'signup-pw-1234',
    name: '신입',
    phone: '01044445555',
    birthDate: '1992-06-06',
    gender: 'FEMALE',
    isMinorAtSignup: false,
  };

  async function signup(loginId: string): Promise<string> {
    const res = await request(ctx.http())
      .post('/auth/signup')
      .send({
        ...signupBase,
        loginId,
        agreedTermsDocumentIds: seeded.termsIds,
      })
      .expect(201);
    return res.body.id as string;
  }

  it('가입 신청자는 pending 목록에 뜬다', async () => {
    const id = await signup('applicant1');
    const mgr = await login(ctx, 'manager');
    const res = await asUser(ctx, mgr.accessToken)
      .get('/users/pending')
      .expect(200);
    expect(res.body.items.map((u: { id: string }) => u.id)).toContain(id);
  });

  it('실장이 학생으로 승인하면 ACTIVE·STUDENT가 되고 본인 비밀번호로 로그인된다', async () => {
    const id = await signup('applicant2');
    const mgr = await login(ctx, 'manager');
    const res = await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'STUDENT' })
      .expect(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.role).toBe('STUDENT');

    const login1 = await request(ctx.http())
      .post('/auth/login')
      .send({
        loginId: 'applicant2',
        password: signupBase.password,
        deviceIdentifier: DEVICE,
      })
      .expect(200);
    expect(login1.body.user.role).toBe('STUDENT');
  });

  it('강사로 승인하면 학생 프로필과 생년월일·성별이 제거된다', async () => {
    const id = await signup('applicant3');
    const mgr = await login(ctx, 'manager');
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'INSTRUCTOR' })
      .expect(201);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { studentProfile: true },
    });
    expect(user.role).toBe('INSTRUCTOR');
    expect(user.status).toBe('ACTIVE');
    expect(user.birthDate).toBeNull();
    expect(user.gender).toBeNull();
    expect(user.studentProfile).toBeNull();
  });

  it('실장·원장은 실장/원장/관리자 역할을 부여할 수 없다 (403)', async () => {
    const id = await signup('applicant4');
    const mgr = await login(ctx, 'manager');
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'MANAGER' })
      .expect(403);
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'PRINCIPAL' })
      .expect(403);
  });

  it('관리자는 원장 역할까지 부여할 수 있다', async () => {
    const id = await signup('applicant5');
    const admin = await login(ctx, 'admin');
    const res = await asUser(ctx, admin.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'PRINCIPAL' })
      .expect(201);
    expect(res.body.role).toBe('PRINCIPAL');
  });

  it('이미 승인된 신청자는 다시 승인할 수 없다 (409)', async () => {
    const id = await signup('applicant6');
    const mgr = await login(ctx, 'manager');
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'STUDENT' })
      .expect(201);
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'STUDENT' })
      .expect(409);
  });

  it('역할 없이 승인 요청하면 400', async () => {
    const id = await signup('applicant7');
    const mgr = await login(ctx, 'manager');
    await asUser(ctx, mgr.accessToken)
      .post(`/users/${id}/approve`)
      .send({})
      .expect(400);
  });

  it('직원 직접 생성 경로는 제거되어 404', async () => {
    const admin = await login(ctx, 'admin');
    await asUser(ctx, admin.accessToken)
      .post('/users/staff')
      .send({
        loginId: 'directstaff',
        name: '직원',
        phone: '010-6666-7777',
        role: 'INSTRUCTOR',
      })
      .expect(404);
  });

  it('강사는 가입 승인 권한이 없다 (403)', async () => {
    const id = await signup('applicant8');
    const inst = await login(ctx, 'inst1');
    await asUser(ctx, inst.accessToken)
      .post(`/users/${id}/approve`)
      .send({ role: 'STUDENT' })
      .expect(403);
  });
});
