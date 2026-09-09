import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { SessionMaintenanceService } from '../src/maintenance/session-maintenance.service';
import { SessionStatus } from '../src/generated/prisma/enums';
import {
  asUser,
  bootstrapTestApp,
  login,
  resetDb,
  seedCore,
  seedSession,
  seedTeachingContext,
  type TeachingContext,
  type TestContext,
} from './helpers';

describe('출석 (기획안 §7·§11·D-04·D-37·D-46, §15.3)', () => {
  let ctx: TestContext;
  let maintenance: SessionMaintenanceService;
  let seeded: Awaited<ReturnType<typeof seedCore>>;
  let tc: TeachingContext;

  beforeAll(async () => {
    ctx = await bootstrapTestApp();
    maintenance = ctx.app.get(SessionMaintenanceService);
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
  });

  describe('수업 시작·종료 배치 (D-37)', () => {
    it('시작 시각이 지난 수업을 진행 중으로 바꾸고 수강생 전원에게 UNPROCESSED 를 만든다', async () => {
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
      );

      await maintenance.run();

      const session = await ctx.prisma.classSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true },
      });
      expect(session.status).toBe(SessionStatus.IN_PROGRESS);

      const records = await ctx.prisma.attendanceRecord.findMany({
        where: { classSessionId: sessionId },
        select: { studentId: true, status: true },
      });
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.status === 'UNPROCESSED')).toBe(true);
    });

    it('종료 시각이 지난 수업의 미처리 출석을 자동 결석으로 확정하고 이력을 남긴다', async () => {
      const now = Date.now();
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
        {
          startsAt: new Date(now - 120 * 60_000),
          endsAt: new Date(now - 60 * 60_000),
          status: SessionStatus.SCHEDULED,
        },
      );
      // 시작 배치가 명단을 만들도록 한 번 더 상태를 되돌려 둔다
      await ctx.prisma.classSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.IN_PROGRESS },
      });

      await maintenance.run();

      const session = await ctx.prisma.classSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { status: true },
      });
      expect(session.status).toBe(SessionStatus.COMPLETED);

      const records = await ctx.prisma.attendanceRecord.findMany({
        where: { classSessionId: sessionId },
        select: { id: true, status: true, method: true },
      });
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.status === 'ABSENT')).toBe(true);
      expect(records.every((r) => r.method === 'SYSTEM_AUTO')).toBe(true);

      const histories = await ctx.prisma.attendanceChangeHistory.findMany({
        where: { attendanceRecordId: { in: records.map((r) => r.id) } },
        select: { previousStatus: true, newStatus: true, changedById: true },
      });
      expect(histories).toHaveLength(2);
      expect(
        histories.every(
          (h) =>
            h.previousStatus === 'UNPROCESSED' &&
            h.newStatus === 'ABSENT' &&
            h.changedById === null,
        ),
      ).toBe(true);
    });

    it('재실행해도 결석·이력이 중복되지 않는다', async () => {
      const now = Date.now();
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
        {
          startsAt: new Date(now - 120 * 60_000),
          endsAt: new Date(now - 60 * 60_000),
          status: SessionStatus.SCHEDULED,
        },
      );
      await maintenance.run();
      await maintenance.run();

      const records = await ctx.prisma.attendanceRecord.count({
        where: { classSessionId: sessionId },
      });
      const histories = await ctx.prisma.attendanceChangeHistory.count({
        where: { attendanceRecord: { classSessionId: sessionId } },
      });
      expect(records).toBe(2);
      expect(histories).toBe(2);
    });
  });

  describe('출석 코드 (D-46)', () => {
    async function startedSession(): Promise<string> {
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
        {},
      );
      await maintenance.run(); // UNPROCESSED 명단 생성
      return sessionId;
    }

    it('강사가 코드를 만들고 학생이 입력하면 출석 처리된다', async () => {
      const sessionId = await startedSession();
      const inst = await login(ctx, 'inst1');
      const gen = await asUser(ctx, inst.accessToken)
        .post(`/classes/${tc.classId}/sessions/${sessionId}/attendance-code`)
        .expect(201);
      const code = gen.body.code as string;
      expect(code).toMatch(/^\d{4}$/);

      const stu = await login(ctx, 'stu1');
      const res = await asUser(ctx, stu.accessToken)
        .post('/attendance/code')
        .send({ classSessionId: sessionId, code })
        .expect(201);
      expect(res.body.status).toBe('PRESENT');

      // 재입력은 새 기록을 만들지 않고 기존 결과를 돌려준다
      const again = await asUser(ctx, stu.accessToken)
        .post('/attendance/code')
        .send({ classSessionId: sessionId, code })
        .expect(201);
      expect(again.body.alreadyProcessed).toBe(true);
      expect(again.body.attendanceRecordId).toBe(res.body.attendanceRecordId);
    });

    it('같은 코드에 5회 틀리면 차단된다', async () => {
      const sessionId = await startedSession();
      const inst = await login(ctx, 'inst1');
      await asUser(ctx, inst.accessToken)
        .post(`/classes/${tc.classId}/sessions/${sessionId}/attendance-code`)
        .expect(201);

      const stu = await login(ctx, 'stu1');
      for (let i = 0; i < 5; i += 1) {
        await asUser(ctx, stu.accessToken)
          .post('/attendance/code')
          .send({ classSessionId: sessionId, code: '0000' })
          .expect(400);
      }
      const blocked = await asUser(ctx, stu.accessToken)
        .post('/attendance/code')
        .send({ classSessionId: sessionId, code: '0000' });
      expect(blocked.status).toBe(429);
    });
  });

  describe('수동 수정 (D-04)', () => {
    it('강사는 수업일 당일에는 수정할 수 있고 이력이 남는다', async () => {
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
        {},
      );
      await maintenance.run();
      const record = await ctx.prisma.attendanceRecord.findFirstOrThrow({
        where: { classSessionId: sessionId, studentId: seeded.users.stu1.id },
        select: { id: true },
      });

      const inst = await login(ctx, 'inst1');
      await asUser(ctx, inst.accessToken)
        .patch(`/sessions/${sessionId}/attendance/${record.id}`)
        .send({ status: 'EXCUSED', reason: '병결 확인' })
        .expect(200);

      const histories = await ctx.prisma.attendanceChangeHistory.count({
        where: { attendanceRecordId: record.id },
      });
      expect(histories).toBe(1);
    });

    it('강사는 지난 수업일의 출석을 수정할 수 없다 (403), 실장은 가능하다', async () => {
      const past = new Date('2026-02-01T01:00:00Z');
      const sessionId = await seedSession(
        ctx.prisma,
        tc,
        seeded.users.inst1.id,
        {
          startsAt: past,
          endsAt: new Date(past.getTime() + 60 * 60_000),
          status: SessionStatus.IN_PROGRESS,
        },
      );
      await maintenance.run();
      const record = await ctx.prisma.attendanceRecord.findFirstOrThrow({
        where: { classSessionId: sessionId, studentId: seeded.users.stu1.id },
        select: { id: true },
      });

      const inst = await login(ctx, 'inst1');
      await asUser(ctx, inst.accessToken)
        .patch(`/sessions/${sessionId}/attendance/${record.id}`)
        .send({ status: 'EXCUSED', reason: '늦은 정정' })
        .expect(403);

      const mgr = await login(ctx, 'manager');
      await asUser(ctx, mgr.accessToken)
        .patch(`/sessions/${sessionId}/attendance/${record.id}`)
        .send({ status: 'EXCUSED', reason: '늦은 정정' })
        .expect(200);
    });
  });
});
