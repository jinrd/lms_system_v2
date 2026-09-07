import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AttemptStatus,
  ExamPartType,
  ExamStatus,
  PassStatus,
  SubmissionMethod,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { WrittenGradingService } from './written-grading.service';

/** 배치 주기. 시험 파트 시작·종료가 분 단위이므로 1분이면 충분하다. */
const INTERVAL_MS = 60_000;

/** 조회 직전 호출에서 이 시간 안에 이미 돌았으면 다시 돌지 않는다. */
const FRESH_MS = 10_000;

/**
 * 시간에 맞춰 시험을 진행시키는 유지보수 작업이다.
 *
 * `SessionMaintenanceService`와 같은 방식(주기적 setInterval + 조회 직전 보정)으로
 * 동작한다. 한 틱에서 다음을 순서대로 처리한다.
 *
 * 1. 대상 명단 자동 잠금 — 가장 이른 파트 시작 시각이 지난 예약 시험(D-30).
 * 2. 응시 개시 전이 — 전체 시작 시각이 지난 예약 시험을 `OPEN`으로.
 * 3. 필기 개인 마감 자동 제출·자동 채점 — `deadline_at`이 지난 진행 중 제출을
 *    마지막 저장 답안으로 제출하고 즉시 채점한다(D-25).
 * 4. 응시 종료 전이 — 전체 종료 시각이 지난 `OPEN` 시험을 `CLOSED`로.
 * 5. 미응시·미완료 확정 — 종료된 시험에서 한 파트도 시작하지 않은 응시를
 *    `NOT_ATTENDED`·최종 `FAIL`로, 시작만 하고 못 낸 응시를 `INCOMPLETE`로(D-29).
 * 6. 채점 대기 전이 — 미채점 필기 제출이 없는 `CLOSED` 시험을 `GRADING`으로.
 *
 * 실기 파트 관련 전이는 이번 작업 범위에서 다루지 않는다.
 */
@Injectable()
export class ExamMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExamMaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastRunAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly writtenGrading: WrittenGradingService,
  ) {}

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
      await this.lockTargetsAndOpen(now);
      await this.autoSubmitAndGradeWritten(now);
      await this.closeAndConfirm(now);

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

  /** 1·2단계: 대상 명단 자동 잠금과 응시 개시 전이. */
  private async lockTargetsAndOpen(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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

      await tx.exam.updateMany({
        where: { status: ExamStatus.SCHEDULED, opensAt: { lte: now } },
        data: { status: ExamStatus.OPEN },
      });
    });
  }

  /**
   * 3단계: 개인 마감이 지난 진행 중 필기 제출을 선점해 자동 제출하고 채점한다.
   *
   * `updateMany`의 `status = IN_PROGRESS` 조건이 학생의 수동 제출과의 경합을
   * 막는다. 우리가 전이를 성공시킨(count = 1) 제출만 채점한다.
   */
  private async autoSubmitAndGradeWritten(now: Date): Promise<void> {
    const due = await this.prisma.examPartSubmission.findMany({
      where: {
        status: AttemptStatus.IN_PROGRESS,
        deadlineAt: { lte: now },
        examPart: { type: ExamPartType.WRITTEN },
        exam: { status: { not: ExamStatus.CANCELED } },
      },
      select: {
        id: true,
        version: true,
        examPart: { select: { closesAt: true } },
      },
    });

    for (const submission of due) {
      const method =
        now >= submission.examPart.closesAt
          ? SubmissionMethod.AUTO_PART_CLOSED
          : SubmissionMethod.AUTO_TIMEOUT;

      const claimed = await this.prisma.examPartSubmission.updateMany({
        where: { id: submission.id, status: AttemptStatus.IN_PROGRESS },
        data: {
          status: AttemptStatus.SUBMITTED,
          submittedAt: now,
          submissionMethod: method,
          version: submission.version + 1,
        },
      });
      if (claimed.count === 1) {
        await this.writtenGrading.gradeWrittenSubmission(submission.id);
      }
    }
  }

  /** 4·5·6단계: 응시 종료 전이, 미응시·미완료 확정, 채점 대기 전이. */
  private async closeAndConfirm(now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 4. 전체 종료 시각이 지난 OPEN 시험을 CLOSED 로.
      await tx.exam.updateMany({
        where: { status: ExamStatus.OPEN, closesAt: { lte: now } },
        data: { status: ExamStatus.CLOSED },
      });

      // 5. 종료된 시험의 미응시·미완료 응시를 확정한다.
      const closedExams = await tx.exam.findMany({
        where: {
          status: { in: [ExamStatus.CLOSED, ExamStatus.GRADING] },
          closesAt: { lte: now },
        },
        select: { id: true },
      });
      for (const exam of closedExams) {
        await tx.examAttempt.updateMany({
          where: { examId: exam.id, status: AttemptStatus.NOT_STARTED },
          data: {
            status: AttemptStatus.NOT_ATTENDED,
            finalResult: PassStatus.FAIL,
          },
        });
        await tx.examAttempt.updateMany({
          where: {
            examId: exam.id,
            status: AttemptStatus.IN_PROGRESS,
            partSubmissions: {
              none: {
                status: {
                  in: [AttemptStatus.SUBMITTED, AttemptStatus.GRADED],
                },
              },
            },
          },
          data: { status: AttemptStatus.INCOMPLETE },
        });
      }

      // 6. 미채점 필기 제출이 없는 CLOSED 시험을 GRADING 으로.
      const toGrading = await tx.exam.findMany({
        where: {
          status: ExamStatus.CLOSED,
          closesAt: { lte: now },
          parts: {
            none: {
              type: ExamPartType.WRITTEN,
              submissions: {
                some: {
                  status: {
                    in: [AttemptStatus.IN_PROGRESS, AttemptStatus.SUBMITTED],
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      if (toGrading.length > 0) {
        await tx.exam.updateMany({
          where: { id: { in: toGrading.map((exam) => exam.id) } },
          data: { status: ExamStatus.GRADING },
        });
      }
    });
  }
}
