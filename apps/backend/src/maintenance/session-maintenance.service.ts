import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AttendanceCodeStatus,
  AttendanceMethod,
  AttendanceStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

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
        // 예정 시작 시각이 지난 수업을 자동으로 진행 상태로 만든다.
        await tx.classSession.updateMany({
          where: {
            status: SessionStatus.SCHEDULED,
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
          data: { status: SessionStatus.IN_PROGRESS, actualStartedAt: now },
        });

        // 예정 종료 시각이 지난 수업을 완료 처리한다.
        // 아무도 시작하지 않아 예정 상태로 남은 수업도 함께 완료한다.
        await tx.classSession.updateMany({
          where: {
            status: {
              in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS],
            },
            endsAt: { lte: now },
          },
          data: { status: SessionStatus.COMPLETED, actualEndedAt: now },
        });

        // 종료된 수업의 미처리 출석을 결석으로 확정한다.
        // 휴강 수업은 출석률에서 제외하므로 대상이 아니다.
        await tx.attendanceRecord.updateMany({
          where: {
            status: AttendanceStatus.UNPROCESSED,
            classSession: {
              endsAt: { lte: now },
              status: { not: SessionStatus.CANCELED },
            },
          },
          data: {
            status: AttendanceStatus.ABSENT,
            method: AttendanceMethod.SYSTEM_AUTO,
          },
        });

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
}
