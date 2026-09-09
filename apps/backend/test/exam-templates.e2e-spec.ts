import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import {
  asUser,
  bootstrapTestApp,
  login,
  resetDb,
  seedCore,
  seedTeachingContext,
  type TeachingContext,
  type TestContext,
} from './helpers';

describe('시험 템플릿 (기획안 §13, 개선방향 §3, §15.3)', () => {
  let ctx: TestContext;
  let seeded: Awaited<ReturnType<typeof seedCore>>;
  let tc: TeachingContext;
  let inst: { accessToken: string };

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma);
    seeded = await seedCore(ctx.prisma);
    tc = await seedTeachingContext(ctx.prisma, {
      instructorId: seeded.users.inst1.id,
      studentIds: [seeded.users.stu1.id],
    });
    inst = await login(ctx, 'inst1');
  });

  type Template = {
    id: string;
    updatedAt: string;
    parts: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };

  async function createTemplate(): Promise<Template> {
    const res = await asUser(ctx, inst.accessToken)
      .post('/exam-templates')
      .send({
        name: `템플릿-${Date.now()}`,
        scope: 'SUBJECT',
        stage: 'REGULAR',
        subjectIds: [tc.subjectId],
      })
      .expect(201);
    return res.body as Template;
  }

  it('생성한 템플릿에는 active 플래그도 파트 점수도 없다', async () => {
    const tpl = await createTemplate();
    expect(tpl).not.toHaveProperty('active');
    expect(tpl.parts).toEqual([]);
  });

  it('활성화·비활성화·검증 라우트는 제거되어 404', async () => {
    const tpl = await createTemplate();
    await asUser(ctx, inst.accessToken)
      .post(`/exam-templates/${tpl.id}/activate`)
      .expect(404);
    await asUser(ctx, inst.accessToken)
      .post(`/exam-templates/${tpl.id}/deactivate`)
      .expect(404);
    await asUser(ctx, inst.accessToken)
      .get(`/exam-templates/${tpl.id}/validate`)
      .expect(404);
  });

  it('파트 upsert 에 점수를 보내면 400 (whitelist), expectedUpdatedAt 없으면 400', async () => {
    const tpl = await createTemplate();

    await asUser(ctx, inst.accessToken)
      .put(`/exam-templates/${tpl.id}/parts/WRITTEN`)
      .send({
        totalScore: 100,
        passScore: 60,
        durationMinutes: 60,
        defaultOpenOffsetDays: 0,
        defaultOpenDays: 7,
        expectedUpdatedAt: tpl.updatedAt,
      })
      .expect(400);

    await asUser(ctx, inst.accessToken)
      .put(`/exam-templates/${tpl.id}/parts/WRITTEN`)
      .send({
        durationMinutes: 60,
        defaultOpenOffsetDays: 0,
        defaultOpenDays: 7,
      })
      .expect(400);
  });

  it('필기 파트를 점수 없이 upsert 한다', async () => {
    const tpl = await createTemplate();
    const res = await asUser(ctx, inst.accessToken)
      .put(`/exam-templates/${tpl.id}/parts/WRITTEN`)
      .send({
        durationMinutes: 60,
        defaultOpenOffsetDays: 0,
        defaultOpenDays: 7,
        expectedUpdatedAt: tpl.updatedAt,
      })
      .expect(200);
    const parts = (res.body as Template).parts;
    expect(parts).toHaveLength(1);
    expect(parts[0]).not.toHaveProperty('totalScore');
    expect(parts[0]).not.toHaveProperty('passScore');
    expect(parts[0].type).toBe('WRITTEN');
  });

  it('동시 편집: 오래된 expectedUpdatedAt 으로 저장하면 409', async () => {
    const tpl = await createTemplate();
    const stale = tpl.updatedAt;

    // 첫 수정 성공 → updatedAt 이 바뀐다
    await asUser(ctx, inst.accessToken)
      .patch(`/exam-templates/${tpl.id}`)
      .send({ name: '수정본 A', expectedUpdatedAt: stale })
      .expect(200);

    // 같은(이제 낡은) 값으로 다시 시도 → 409
    await asUser(ctx, inst.accessToken)
      .patch(`/exam-templates/${tpl.id}`)
      .send({ name: '수정본 B', expectedUpdatedAt: stale })
      .expect(409);
  });

  it('템플릿은 조건 없이 삭제된다', async () => {
    const tpl = await createTemplate();
    await asUser(ctx, inst.accessToken)
      .delete(`/exam-templates/${tpl.id}`)
      .expect(204);
    await asUser(ctx, inst.accessToken)
      .get(`/exam-templates/${tpl.id}`)
      .expect(404);
  });
});
