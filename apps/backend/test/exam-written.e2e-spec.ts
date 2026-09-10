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
  seedFullWrittenExam,
  seedTeachingContext,
  type FullWrittenExam,
  type TeachingContext,
  type TestContext,
} from './helpers';

type WrittenQuestion = {
  examQuestionId: string;
  type: string;
  displayOrder: number;
  options: Array<{ examQuestionOptionId: string; content: string }>;
  answer: { version: number } | null;
};

describe('필기 응시·채점 (기획안 §8·§15.2·D-23·D-24·D-25, §15.3)', () => {
  let ctx: TestContext;
  let seeded: Awaited<ReturnType<typeof seedCore>>;
  let tc: TeachingContext;
  let exam: FullWrittenExam;
  let stu: { accessToken: string };

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
      studentIds: [seeded.users.stu1.id, seeded.users.stu2.id],
    });
    exam = await seedFullWrittenExam(ctx.prisma, tc, [
      seeded.users.stu1.id,
      seeded.users.stu2.id,
    ]);
    stu = await login(ctx, 'stu1');
  });

  const startUrl = () => `/me/exams/${exam.examId}/parts/WRITTEN/start`;
  const answerUrl = (qid: string) =>
    `/me/exams/${exam.examId}/parts/WRITTEN/answers/${qid}`;
  const submitUrl = () => `/me/exams/${exam.examId}/parts/WRITTEN/submit`;

  async function start(token: string): Promise<WrittenQuestion[]> {
    const res = await asUser(ctx, token).post(startUrl()).expect(201);
    return res.body.questions as WrittenQuestion[];
  }

  it('start 를 두 번 불러도 500 없이 같은 문제 순서를 돌려준다', async () => {
    const first = await start(stu.accessToken);
    const second = await start(stu.accessToken);
    expect(first.map((q) => q.examQuestionId)).toEqual(
      second.map((q) => q.examQuestionId),
    );
    // 한 학생당 파트 제출 행은 1개
    const count = await ctx.prisma.examPartSubmission.count({
      where: { examAttemptId: exam.attempts[seeded.users.stu1.id] },
    });
    expect(count).toBe(1);
  });

  it('자동 저장: 낡은 version 으로 저장하면 409', async () => {
    const qs = await start(stu.accessToken);
    const shortQ = qs.find((q) => q.type === 'SHORT_ANSWER')!;

    const saved = await asUser(ctx, stu.accessToken)
      .put(answerUrl(shortQ.examQuestionId))
      .send({ version: 0, subjectiveText: '서울' })
      .expect(200);
    expect(saved.body.version).toBe(1);

    // 다시 version 0 (낡음) → 409
    await asUser(ctx, stu.accessToken)
      .put(answerUrl(shortQ.examQuestionId))
      .send({ version: 0, subjectiveText: '부산' })
      .expect(409);
  });

  it('제출하면 자동 채점된다 — 정답이면 PASS, 오답이면 FAIL', async () => {
    // stu1: 둘 다 정답
    const qs1 = await start(stu.accessToken);
    const single1 = qs1.find((q) => q.type === 'SINGLE_CHOICE')!;
    const short1 = qs1.find((q) => q.type === 'SHORT_ANSWER')!;
    const correctOption = single1.options.find((o) => o.content === '2')!;
    await asUser(ctx, stu.accessToken)
      .put(answerUrl(single1.examQuestionId))
      .send({
        version: 0,
        selectedOptionIds: [correctOption.examQuestionOptionId],
      })
      .expect(200);
    await asUser(ctx, stu.accessToken)
      .put(answerUrl(short1.examQuestionId))
      .send({ version: 0, subjectiveText: '  서울  ' }) // 정규화 후 일치
      .expect(200);
    await asUser(ctx, stu.accessToken).post(submitUrl()).expect(201);

    const a1 = await ctx.prisma.examAttempt.findUniqueOrThrow({
      where: { id: exam.attempts[seeded.users.stu1.id] },
      select: { status: true, writtenScore: true, writtenResult: true },
    });
    expect(a1.status).toBe('GRADED');
    expect(Number(a1.writtenScore)).toBe(20);
    expect(a1.writtenResult).toBe('PASS');

    // stu2: 단일 선택 오답 + 단답형 미응답 → 0점 FAIL
    const stu2 = await login(ctx, 'stu2');
    const qs2 = await start(stu2.accessToken);
    const single2 = qs2.find((q) => q.type === 'SINGLE_CHOICE')!;
    const wrong = single2.options.find((o) => o.content === '3')!;
    await asUser(ctx, stu2.accessToken)
      .put(answerUrl(single2.examQuestionId))
      .send({ version: 0, selectedOptionIds: [wrong.examQuestionOptionId] })
      .expect(200);
    await asUser(ctx, stu2.accessToken).post(submitUrl()).expect(201);

    const a2 = await ctx.prisma.examAttempt.findUniqueOrThrow({
      where: { id: exam.attempts[seeded.users.stu2.id] },
      select: { writtenScore: true, writtenResult: true },
    });
    expect(Number(a2.writtenScore)).toBe(0);
    expect(a2.writtenResult).toBe('FAIL');
  });

  it('공개 전에는 학생 결과 조회에 점수가 없다', async () => {
    const qs = await start(stu.accessToken);
    const short = qs.find((q) => q.type === 'SHORT_ANSWER')!;
    await asUser(ctx, stu.accessToken)
      .put(answerUrl(short.examQuestionId))
      .send({ version: 0, subjectiveText: '서울' })
      .expect(200);
    await asUser(ctx, stu.accessToken).post(submitUrl()).expect(201);

    const res = await asUser(ctx, stu.accessToken)
      .get(`/me/exams/${exam.examId}/result`)
      .expect(200);
    // 공개 전에는 점수·파트 결과를 숨기고 finalResult 는 PENDING 자리표시자다.
    expect(res.body.published).toBe(false);
    expect(res.body.writtenScore).toBeNull();
    expect(res.body.finalResult).toBe('PENDING');
    expect(res.body.parts).toEqual([]);
  });

  it('정정 상한: 필기 파트 총점을 넘는 점수는 거부한다 (미응시 응시 기록도)', async () => {
    // stu2 를 미응시로 확정
    await ctx.prisma.examAttempt.update({
      where: { id: exam.attempts[seeded.users.stu2.id] },
      data: { status: 'NOT_ATTENDED', finalResult: 'FAIL' },
    });
    const mgr = await login(ctx, 'manager');
    await asUser(ctx, mgr.accessToken)
      .post(
        `/exams/${exam.examId}/attempts/${exam.attempts[seeded.users.stu2.id]}/revise`,
      )
      .send({ reason: '점수 상향 시도', writtenScore: 9999 })
      .expect(400);
  });

  it('진행 중 시험에 출제된 문제은행 문제는 강사가 수정할 수 없다 (409)', async () => {
    const inst = await login(ctx, 'inst1');
    const res = await asUser(ctx, inst.accessToken)
      .patch(`/questions/${exam.sourceShortId}`)
      .send({ prompt: '몰래 바꾼 지문' });
    expect(res.status).toBe(409);
  });
});
