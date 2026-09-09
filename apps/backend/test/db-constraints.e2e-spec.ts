import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import {
  bootstrapTestApp,
  resetDb,
  seedCore,
  seedQuestionInLiveExam,
  seedTeachingContext,
  type TeachingContext,
  type TestContext,
} from './helpers';

/**
 * Prisma 스키마만으로 표현되지 않는 DB 방어선을 고의로 위반해 거부되는지
 * 본다(기획안 §32, §33.7).
 */
describe('DB 제약·트리거 방어선 (기획안 §32·§33.7)', () => {
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

  it('삭제되지 않은 계정끼리 같은 login_id 는 부분 유니크 위반', async () => {
    await expect(
      ctx.prisma.user.create({
        data: {
          loginId: 'manager', // seedCore 가 이미 만든 값
          passwordHash: 'x'.repeat(20),
          name: '중복',
          phone: '01099998888',
          role: 'STUDENT',
          status: 'ACTIVE',
          mustChangePassword: false,
        },
      }),
    ).rejects.toThrow();
  });

  it('같은 유형의 활성 약관이 2개면 부분 유니크 위반', async () => {
    await expect(
      ctx.prisma.termsDocument.create({
        data: {
          type: '이용약관', // seedCore 가 만든 활성 버전과 같은 유형
          version: '2.0',
          title: 'x',
          content: 'x',
          required: true,
          effectiveAt: new Date('2020-01-01'),
          active: true,
        },
      }),
    ).rejects.toThrow();
  });

  describe('강의 컨텍스트가 필요한 케이스', () => {
    let tc: TeachingContext;
    beforeEach(async () => {
      tc = await seedTeachingContext(ctx.prisma, {
        instructorId: seeded.users.inst1.id,
        studentIds: [seeded.users.stu1.id],
      });
    });

    it('한 수업에 활성 출석 코드 2개는 부분 유니크 위반', async () => {
      const session = await ctx.prisma.classSession.create({
        data: {
          classId: tc.classId,
          classSubjectId: tc.classSubjectId,
          courseOfferingSubjectId: tc.courseOfferingSubjectId,
          classProgramId: tc.classProgramId,
          instructorId: seeded.users.inst1.id,
          kind: 'REGULAR',
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3_600_000),
          status: 'IN_PROGRESS',
        },
        select: { id: true },
      });
      const codeData = {
        classSessionId: session.id,
        codeHash: 'a'.repeat(64),
        status: 'ACTIVE' as const,
        generatedById: seeded.users.inst1.id,
        expiresAt: new Date(Date.now() + 600_000),
      };
      await ctx.prisma.attendanceCode.create({ data: codeData });
      await expect(
        ctx.prisma.attendanceCode.create({
          data: { ...codeData, codeHash: 'b'.repeat(64) },
        }),
      ).rejects.toThrow();
    });

    it('진행 중인 시험에 출제된 문제은행 문제의 수정은 트리거가 막는다', async () => {
      const { questionId } = await seedQuestionInLiveExam(ctx.prisma, tc);

      await expect(
        ctx.prisma.questionBank.update({
          where: { id: questionId },
          data: { prompt: '몰래 바꾼 지문' },
        }),
      ).rejects.toThrow();

      await expect(
        ctx.prisma.questionAcceptedAnswer.updateMany({
          where: { questionId },
          data: { normalizedAnswer: 'changed' },
        }),
      ).rejects.toThrow();
    });

    it('시험이 완료되면 잠금이 풀린다', async () => {
      const { questionId, examId } = await seedQuestionInLiveExam(
        ctx.prisma,
        tc,
      );
      await ctx.prisma.exam.update({
        where: { id: examId },
        data: { status: 'COMPLETED' },
      });
      await expect(
        ctx.prisma.questionBank.update({
          where: { id: questionId },
          data: { prompt: '이제 수정 가능' },
        }),
      ).resolves.toBeTruthy();
    });
  });
});
