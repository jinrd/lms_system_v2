import { Injectable, Logger } from '@nestjs/common';
import { UserRole, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SystemLogsService } from './system-logs.service';

/**
 * 데이터를 변경·삭제하는 정기 작업의 실행 결과를 `data_lifecycle_runs`에
 * 남긴다(기획안 §21.4·§23).
 *
 * 각 작업은 작은 묶음으로 나눠 처리하고, 나이 기준 삭제나 상태 기준 필터를 써서
 * 다시 실행해도 결과가 같은 멱등성을 지킨다. 작업 완료·실패는 `system_logs`에도
 * 요약을 남긴다(§21.1).
 *
 * `FILE_RETENTION`은 오브젝트 스토리지 연동이 확정되지 않아 지금은 아무것도 하지
 * 않는 스텁이다. 실행 이력에는 `scanned = 0`으로 남는다.
 *
 * 실행 주기는 프로세스 안 타이머가 아니라 OS cron이 맡는다. 배포 환경의 cron이
 * 하루 1회 `pnpm --filter @lms/backend lifecycle`(scripts/data-lifecycle.ts)를
 * 호출한다. 관리자 API의 수동 실행도 같은 `runAll()`을 부른다. 재기동마다 전체
 * 재스캔이 돌고 `data_lifecycle_run` 행이 무더기로 쌓이던 문제를 없애기 위함이다.
 */
/** 한 묶음에서 조회·삭제할 행 수. */
const BATCH_SIZE = 1000;
/** 한 번의 실행에서 한 작업이 처리할 최대 행 수. 나머지는 다음 주기로 넘긴다. */
const MAX_PER_RUN = 20000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LifecycleJobType =
  | 'AUDIT_LOG_RETENTION'
  | 'SYSTEM_LOG_RETENTION'
  | 'ATTENDANCE_CODE_ATTEMPT_RETENTION'
  | 'REJECTED_SIGNUP_PURGE'
  | 'ACCOUNT_ANONYMIZATION'
  | 'FILE_RETENTION';

export const LIFECYCLE_JOB_TYPES: readonly LifecycleJobType[] = [
  'AUDIT_LOG_RETENTION',
  'SYSTEM_LOG_RETENTION',
  'ATTENDANCE_CODE_ATTEMPT_RETENTION',
  'REJECTED_SIGNUP_PURGE',
  'ACCOUNT_ANONYMIZATION',
  'FILE_RETENTION',
];

type JobOutcome = {
  scanned: number;
  success: number;
  failure: number;
  lastCursor?: string | null;
};

export type LifecycleRunSummary = {
  /** 이미 다른 실행이 진행 중이어서 이번 호출은 아무것도 하지 않았으면 false. */
  ran: boolean;
  jobs: Array<{ jobType: LifecycleJobType; status: string }>;
};

@Injectable()
export class DataLifecycleService {
  private readonly logger = new Logger(DataLifecycleService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly systemLogs: SystemLogsService,
  ) {}

  /**
   * 모든 생명주기 작업을 순서대로 1회 실행하고 작업별 결과 요약을 돌려준다.
   * OS cron(scripts/data-lifecycle.ts)과 관리자 수동 실행 API가 공유한다.
   * 다른 실행이 진행 중이면 아무것도 하지 않고 `ran: false`를 돌려준다.
   */
  async runAll(): Promise<LifecycleRunSummary> {
    if (this.running) {
      return { ran: false, jobs: [] };
    }
    this.running = true;
    const jobs: LifecycleRunSummary['jobs'] = [];
    try {
      for (const jobType of LIFECYCLE_JOB_TYPES) {
        jobs.push({ jobType, status: await this.runJob(jobType) });
      }
      await this.pruneRunHistory();
    } finally {
      this.running = false;
    }
    return { ran: true, jobs };
  }

  /** 한 작업을 실행하고 `data_lifecycle_runs`에 결과를 남긴다. 최종 상태 문자열을 돌려준다. */
  async runJob(jobType: LifecycleJobType): Promise<string> {
    const run = await this.prisma.dataLifecycleRun.create({
      data: { jobType, startedAt: new Date(), status: 'RUNNING' },
    });

    try {
      const outcome = await this.execute(jobType);
      const status =
        outcome.failure === 0
          ? 'SUCCESS'
          : outcome.success > 0
            ? 'PARTIAL_FAILURE'
            : 'FAILURE';

      await this.prisma.dataLifecycleRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status,
          scannedCount: outcome.scanned,
          successCount: outcome.success,
          failureCount: outcome.failure,
          lastCursor: outcome.lastCursor ?? null,
        },
      });

      await this.systemLogs.record({
        level: status === 'SUCCESS' ? 'INFO' : 'WARN',
        message: `데이터 생명주기 작업 ${jobType} ${status}`,
        route: `job:${jobType}`,
        metadata: {
          jobType,
          status,
          scanned: outcome.scanned,
          success: outcome.success,
          failure: outcome.failure,
        },
      });

      return status;
    } catch (error: unknown) {
      await this.prisma.dataLifecycleRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          status: 'FAILURE',
          errorSummary:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : '알 수 없는 오류',
        },
      });
      await this.systemLogs.record({
        level: 'ERROR',
        message: `데이터 생명주기 작업 ${jobType} 실패`,
        stack: error instanceof Error ? (error.stack ?? null) : null,
        route: `job:${jobType}`,
        metadata: { jobType },
      });
      this.logger.error(`생명주기 작업 ${jobType} 실패`, error as Error);
      return 'FAILURE';
    }
  }

  private execute(jobType: LifecycleJobType): Promise<JobOutcome> {
    switch (jobType) {
      case 'AUDIT_LOG_RETENTION':
        return this.pruneByAge(
          'retention.audit_log_days',
          (threshold, take) =>
            this.prisma.auditLog.findMany({
              where: { createdAt: { lt: threshold } },
              select: { id: true },
              orderBy: { createdAt: 'asc' },
              take,
            }),
          (ids) =>
            this.prisma.auditLog
              .deleteMany({ where: { id: { in: ids } } })
              .then((result) => result.count),
        );
      case 'SYSTEM_LOG_RETENTION':
        return this.pruneByAge(
          'retention.system_log_days',
          (threshold, take) =>
            this.prisma.systemLog.findMany({
              where: { createdAt: { lt: threshold } },
              select: { id: true },
              orderBy: { createdAt: 'asc' },
              take,
            }),
          (ids) =>
            this.prisma.systemLog
              .deleteMany({ where: { id: { in: ids } } })
              .then((result) => result.count),
        );
      case 'ATTENDANCE_CODE_ATTEMPT_RETENTION':
        return this.pruneByAge(
          'retention.attendance_code_attempt_days',
          (threshold, take) =>
            this.prisma.attendanceCodeAttempt.findMany({
              where: { attemptedAt: { lt: threshold } },
              select: { id: true },
              orderBy: { attemptedAt: 'asc' },
              take,
            }),
          (ids) =>
            this.prisma.attendanceCodeAttempt
              .deleteMany({ where: { id: { in: ids } } })
              .then((result) => result.count),
        );
      case 'REJECTED_SIGNUP_PURGE':
        return this.purgeRejectedSignups();
      case 'ACCOUNT_ANONYMIZATION':
        return this.anonymizeInactiveStudents();
      case 'FILE_RETENTION':
        // 오브젝트 스토리지 연동 전까지 스텁. 실행 이력만 남긴다.
        return Promise.resolve({ scanned: 0, success: 0, failure: 0 });
    }
  }

  /**
   * 나이가 보존 기한을 넘긴 행을 묶음 단위로 삭제한다. 항상 오래된 행부터
   * 지우므로 다음 주기가 이어서 처리한다.
   */
  private async pruneByAge(
    settingKey:
      | 'retention.audit_log_days'
      | 'retention.system_log_days'
      | 'retention.attendance_code_attempt_days',
    findOldestIds: (threshold: Date, take: number) => Promise<{ id: string }[]>,
    deleteByIds: (ids: string[]) => Promise<number>,
  ): Promise<JobOutcome> {
    const days = await this.settings.getNumber(settingKey);
    const threshold = new Date(Date.now() - days * DAY_MS);
    let deleted = 0;

    while (deleted < MAX_PER_RUN) {
      const rows = await findOldestIds(threshold, BATCH_SIZE);
      if (rows.length === 0) {
        break;
      }
      deleted += await deleteByIds(rows.map((row) => row.id));
      if (rows.length < BATCH_SIZE) {
        break;
      }
    }

    return {
      scanned: deleted,
      success: deleted,
      failure: 0,
      lastCursor: threshold.toISOString(),
    };
  }

  /**
   * 거절 후 보관 기한이 지난 가입 신청 계정을, 학습 관계가 전혀 없을 때만
   * 물리 삭제한다(기획안 §23). 이력·약관 동의·프로필은 함께 지운다.
   */
  private async purgeRejectedSignups(): Promise<JobOutcome> {
    const now = new Date();
    const candidates = await this.prisma.user.findMany({
      where: {
        status: UserStatus.REJECTED,
        scheduledDeletionAt: { not: null, lte: now },
      },
      select: { id: true },
      take: MAX_PER_RUN,
    });

    let success = 0;
    let failure = 0;

    for (const { id } of candidates) {
      try {
        const [enroll, attend, attempt, submission] = await Promise.all([
          this.prisma.enrollment.count({ where: { studentId: id } }),
          this.prisma.attendanceRecord.count({ where: { studentId: id } }),
          this.prisma.examAttempt.count({ where: { studentId: id } }),
          this.prisma.assignmentSubmission.count({ where: { studentId: id } }),
        ]);
        if (enroll + attend + attempt + submission > 0) {
          // 학습 관계가 있으면 물리 삭제하지 않는다. 익명화 경로에서 다룬다.
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.userStatusHistory.deleteMany({ where: { userId: id } });
          // authSession·termsConsent·studentProfile은 FK CASCADE로 함께 삭제된다.
          await tx.user.delete({ where: { id } });
        });
        success += 1;
      } catch (error: unknown) {
        failure += 1;
        this.logger.warn(
          `가입 거절 계정 삭제 실패 user=${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { scanned: candidates.length, success, failure };
  }

  /**
   * 비활성 후 보관 기한이 지난 학생 계정의 개인정보를 익명화하고 로그인 수단을
   * 제거한다(기획안 §23·§29). 학습 기록과 사용자 행은 보존한다.
   */
  private async anonymizeInactiveStudents(): Promise<JobOutcome> {
    const now = new Date();
    const candidates = await this.prisma.user.findMany({
      where: {
        role: UserRole.STUDENT,
        status: UserStatus.INACTIVE,
        scheduledDeletionAt: { not: null, lte: now },
      },
      select: { id: true, status: true },
      take: MAX_PER_RUN,
    });

    let success = 0;
    let failure = 0;

    for (const user of candidates) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: user.id },
            data: {
              name: `탈퇴학생-${user.id.slice(0, 8)}`,
              loginId: null,
              email: null,
              phone: null,
              birthDate: null,
              gender: null,
              passwordHash: null,
              status: UserStatus.DELETED,
              deletedAt: now,
              tokenVersion: { increment: 1 },
            },
          });
          await tx.studentProfile.updateMany({
            where: { userId: user.id },
            data: {
              guardianName: null,
              guardianPhone: null,
              guardianRemovedAt: now,
            },
          });
          await tx.authSession.updateMany({
            where: { userId: user.id, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'ACCOUNT_ANONYMIZED' },
          });
          await tx.userStatusHistory.create({
            data: {
              userId: user.id,
              previousStatus: user.status,
              newStatus: UserStatus.DELETED,
              reason: '비활성 보관 기한 경과에 따른 자동 익명화',
            },
          });
        });
        success += 1;
      } catch (error: unknown) {
        failure += 1;
        this.logger.warn(
          `학생 계정 익명화 실패 user=${user.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return { scanned: candidates.length, success, failure };
  }

  /** 자기 실행 이력도 보존 기한(§23)이 지나면 정리한다. 별도 run 으로 남기지 않는다. */
  private async pruneRunHistory(): Promise<void> {
    const days = await this.settings.getNumber(
      'retention.data_lifecycle_run_days',
    );
    const threshold = new Date(Date.now() - days * DAY_MS);
    await this.prisma.dataLifecycleRun.deleteMany({
      where: { startedAt: { lt: threshold } },
    });
  }
}
