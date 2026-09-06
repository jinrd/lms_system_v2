import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ExamStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/** 배치 주기. 시험 파트 시작·종료가 분 단위이므로 1분이면 충분하다. */
const INTERVAL_MS = 60_000;

/** 조회 직전 호출에서 이 시간 안에 이미 돌았으면 다시 돌지 않는다. */
const FRESH_MS = 10_000;

/**
 * 시간에 맞춰 시험을 진행시키는 유지보수 작업이다.
 *
 * `SessionMaintenanceService`와 같은 방식(주기적 setInterval + 조회 직전 보정)으로
 * 동작한다. 이번 단계에서는 두 가지만 처리한다.
 *
 * 1. 대상 명단 자동 잠금 — 가장 이른 파트 시작 시각이 지난 예약 시험의 명단을
 *    서버가 잠근다. 처리자는 비워 두고 감사 로그를 남긴다(기획안 D-30).
 * 2. 응시 개시 전이 — 시험 전체 시작 시각이 지난 예약 시험을 `OPEN`으로 바꾼다.
 *
 * 마감·채점·자동 제출 전이는 이후 단계에서 이 서비스에 더한다.
 */
@Injectable()
export class ExamMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamMaintenanceService.name);
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
        // 1. 가장 이른 파트 시작 시각이 지난 예약 시험의 대상 명단을 자동 잠근다.
        const toLock = await tx.exam.findMany({
          where: {
            status: ExamStatus.SCHEDULED,
            targetLockedAt: null,
            parts: { some: { opensAt: { lte: now } } },
          },
          select: { id: true },
        });

        for (const exam of toLock) {
          await tx.exam.update({
            where: { id: exam.id },
            data: { targetLockedAt: now, targetLockedById: null },
          });
          await tx.auditLog.create({
            data: {
              actorId: null,
              actorRole: null,
              action: 'EXAM_TARGETS_LOCKED',
              resourceType: 'EXAM',
              resourceId: exam.id,
              afterData: { auto: true },
              result: 'SUCCESS',
            },
          });
        }

        // 2. 전체 시작 시각이 지난 예약 시험을 응시 개시 상태로 바꾼다.
        await tx.exam.updateMany({
          where: {
            status: ExamStatus.SCHEDULED,
            opensAt: { lte: now },
          },
          data: { status: ExamStatus.OPEN },
        });
      });

      this.lastRunAt = Date.now();
    } catch (error: unknown) {
      this.logger.error(
        '시험 상태 자동 처리에 실패했습니다.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
