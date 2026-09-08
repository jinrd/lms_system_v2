import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AttendanceCodeStatus, SessionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

/** 배치 주기. 수업 시작·종료가 분 단위이므로 1분이면 충분하다. */
const INTERVAL_MS = 60_000;

/** 조회 직전 호출에서 이 시간 안에 이미 돌았으면 다시 돌지 않는다. */
const FRESH_MS = 10_000;

/**
 * 수업 상태와 자동 결석을 시간에 맞춰 진행시키는 유지보수 작업이다.
 *
 * 예전에는 수업 목록을 조회할 때만 처리해서, 아무도 조회하지 않으면 수업이
 * 영원히 예정 상태로 남고 결석 처리도 되지 않았다. 이제 서버가 주기적으로
 * 직접 처리하고, 조회 직전에도 필요하면 한 번 더 돌려 화면이 즉시 최신이 되게 한다.
 *
 * 출석 대상 명단(`UNPROCESSED` 레코드)은 수업이 시작되는 순간 이 배치가 만든다.
 * 강사가 화면을 열거나 학생이 코드를 입력할 때 만들던 지연 생성은 보조 수단으로만
 * 남는다. 아무 상호작용 없이 끝난 수업도 종료 배치에서 누락 대상자를 보완한 뒤
 * 자동 결석 처리한다(기획안 §11.2 / D-37).
 */
@Injectable()
export class SessionMaintenanceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SessionMaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.timer = setInterval(() => {
      void this.run();
    }, INTERVAL_MS);
    this.timer.unref();

    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 마지막 실행이 충분히 최근이면 건너뛴다. 조회 경로에서 사용한다. */
  async runIfStale(): Promise<void> {
    if (Date.now() - this.lastRunAt < FRESH_MS) {
      return;
    }

    await this.run();
  }

  async run(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    const now = new Date();

    try {
      await this.prisma.$transaction(async (tx) => {
        // 예정 시작 시각이 지난 수업을 진행 상태로 만들고, 전환된 수업의
        // 출석 대상 명단(UNPROCESSED)을 그 자리에서 만든다.
        const starting = await tx.classSession.findMany({
          where: {
            status: SessionStatus.SCHEDULED,
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          select: { id: true },
        });
        if (starting.length > 0) {
          const ids = starting.map((session) => session.id);
          await tx.classSession.updateMany({
            where: { id: { in: ids } },
            data: { status: SessionStatus.IN_PROGRESS, actualStartedAt: now },
          });
          await this.ensureAttendanceTargets(tx, ids);
        }

        // 예정 종료 시각이 지난 수업을 완료 처리한다.
        // 아무도 시작하지 않아 예정 상태로 남은 수업도 함께 완료한다.
        const ending = await tx.classSession.findMany({
          where: {
            status: {
              in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS],
            },
            endsAt: { lte: now },
          },
          select: { id: true },
        });
        if (ending.length > 0) {
          const ids = ending.map((session) => session.id);
          await tx.classSession.updateMany({
            where: { id: { in: ids } },
            data: { status: SessionStatus.COMPLETED, actualEndedAt: now },
          });
          // 시작 배치를 거치지 않고 곧장 완료된 수업도 대상 명단을 보완한다.
          await this.ensureAttendanceTargets(tx, ids);
        }

        // 종료된 수업의 미처리 출석을 결석으로 확정하고 변경 이력을 남긴다.
        // 휴강 수업은 출석률에서 제외하므로 대상이 아니다.
        await this.autoAbsentEndedSessions(tx, now);

        // 만료된 출석 코드를 정리한다.
        await tx.attendanceCode.updateMany({
          where: {
            status: AttendanceCodeStatus.ACTIVE,
            expiresAt: { lte: now },
          },
          data: { status: AttendanceCodeStatus.EXPIRED },
        });
      });

      this.lastRunAt = Date.now();
    } catch (error: unknown) {
      // 배치 실패가 요청 처리를 막지 않도록 로그만 남긴다.
      this.logger.error(
        '수업 상태 자동 처리에 실패했습니다.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * 주어진 수업들의 출석 대상 명단을 `UNPROCESSED`로 채운다. 대상은
   * (1) 유효한 활성 수강의 과목 참여자와 (2) 해당 수업의 개별 보강 참여자다.
   * `class_session_id + student_id` 유니크에 `ON CONFLICT DO NOTHING`이라
   * 여러 번 실행해도 중복이 생기지 않는다.
   */
  private async ensureAttendanceTargets(
    tx: TxClient,
    sessionIds: string[],
  ): Promise<void> {
    if (sessionIds.length === 0) {
      return;
    }

    const ids = Prisma.join(sessionIds);

    // (1) 정규·과목 단위 보충·보강 수강생.
    //     수강과 과목 참여 모두 attendance_managed 이고 수업 날짜(KST)가
    //     참여 기간 안에 있어야 한다.
    await tx.$executeRaw`
      INSERT INTO attendance_records (
        id, class_session_id, course_offering_subject_id, enrollment_id,
        enrollment_subject_id, session_participant_id, student_id, status,
        method, created_at, updated_at
      )
      SELECT
        gen_random_uuid(), cs.id, cs.course_offering_subject_id, e.id, es.id,
        NULL, e.student_id, 'UNPROCESSED'::attendance_status, NULL, now(), now()
      FROM class_sessions cs
      JOIN enrollments e
        ON e.class_id = cs.class_id
       AND e.status = 'ACTIVE'::enrollment_status
       AND e.attendance_managed = true
       AND e.starts_on <= (cs.starts_at AT TIME ZONE 'Asia/Seoul')::date
       AND (e.ends_on IS NULL
            OR e.ends_on >= (cs.starts_at AT TIME ZONE 'Asia/Seoul')::date)
      JOIN enrollment_subjects es
        ON es.enrollment_id = e.id
       AND es.course_offering_subject_id = cs.course_offering_subject_id
       AND es.attendance_managed = true
       AND es.starts_on <= (cs.starts_at AT TIME ZONE 'Asia/Seoul')::date
       AND (es.ends_on IS NULL
            OR es.ends_on >= (cs.starts_at AT TIME ZONE 'Asia/Seoul')::date)
      WHERE cs.id IN (${ids})
        AND cs.status <> 'CANCELED'::session_status
      ON CONFLICT (class_session_id, student_id) DO NOTHING
    `;

    // (2) 특정 날짜 1회 참여하는 개별 보강 학생.
    await tx.$executeRaw`
      INSERT INTO attendance_records (
        id, class_session_id, course_offering_subject_id, enrollment_id,
        enrollment_subject_id, session_participant_id, student_id, status,
        method, created_at, updated_at
      )
      SELECT
        gen_random_uuid(), sp.class_session_id, sp.course_offering_subject_id,
        sp.source_enrollment_id, sp.source_enrollment_subject_id, sp.id,
        sp.student_id, 'UNPROCESSED'::attendance_status, NULL, now(), now()
      FROM session_participants sp
      JOIN class_sessions cs ON cs.id = sp.class_session_id
      WHERE sp.class_session_id IN (${ids})
        AND cs.status <> 'CANCELED'::session_status
      ON CONFLICT (class_session_id, student_id) DO NOTHING
    `;
  }

  /**
   * 종료된 수업의 `UNPROCESSED` 출석을 `ABSENT`/`SYSTEM_AUTO`로 확정하고
   * 같은 트랜잭션에서 `attendance_change_histories`에 시스템 사유의 이력을
   * `changed_by = NULL`로 남긴다(기획안 §11.2). `UNPROCESSED`만 대상이라
   * 여러 번 실행해도 중복 이력이 생기지 않는다.
   */
  private async autoAbsentEndedSessions(
    tx: TxClient,
    now: Date,
  ): Promise<void> {
    await tx.$executeRaw`
      WITH flipped AS (
        UPDATE attendance_records ar
        SET status = 'ABSENT'::attendance_status,
            method = 'SYSTEM_AUTO'::attendance_method,
            updated_at = now()
        FROM class_sessions cs
        WHERE ar.class_session_id = cs.id
          AND ar.status = 'UNPROCESSED'::attendance_status
          AND cs.ends_at <= ${now}
          AND cs.status <> 'CANCELED'::session_status
        RETURNING ar.id
      )
      INSERT INTO attendance_change_histories (
        id, attendance_record_id, previous_status, new_status,
        previous_checked_at, new_checked_at, reason, changed_by, changed_at
      )
      SELECT
        gen_random_uuid(), flipped.id, 'UNPROCESSED'::attendance_status,
        'ABSENT'::attendance_status, NULL, NULL,
        '수업 종료 시각까지 미처리로 남아 시스템이 자동 결석 처리했습니다.',
        NULL, now()
      FROM flipped
    `;
  }
}
