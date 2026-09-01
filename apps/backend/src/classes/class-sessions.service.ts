import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AttendanceMethod,
  AttendanceStatus,
  AttendanceCodeStatus,
  SessionKind,
  SessionStatus,
  UserRole,
} from '../generated/prisma/enums';
import { toSeoulDateString } from '../common/seoul-date';
import { SessionMaintenanceService } from '../maintenance/session-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeClassSessionStatusDto } from './dto/change-class-session-status.dto';
import { ClassSessionRangeDto } from './dto/class-session-range.dto';
import { UpdateClassSessionDto } from './dto/update-class-session.dto';
import { CreateMakeupSessionDto } from './dto/create-makeup-session.dto';
import { CancelClassSessionDto } from './dto/cancel-class-session.dto';
import { UpdateSessionJournalDto } from './dto/update-session-journal.dto';

export type ClassSessionResponse = {
  id: string;
  classId: string;
  classSubjectId: string;
  courseOfferingSubjectId: string;
  schedulePatternId: string | null;
  subjectId: string;
  subjectName: string;
  instructor: {
    id: string;
    name: string;
    loginId: string | null;
  };
  kind: SessionKind;
  title: string | null;
  lessonContent: string | null;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: SessionStatus;
  completedMinutes: number | null;
  journalWrittenAt: string | null;
  journalWrittenBy: { id: string; name: string } | null;
  journalUpdatedAt: string | null;
  journalUpdatedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  replacementForSessionId: string | null;
  canceledAt: string | null;
  canceledBy: {
    id: string;
    name: string;
  } | null;
  cancelReason: string | null;
};

export type ClassSessionGenerationResponse = {
  createdCount: number;
  removedCount: number;
  skippedCount: number;
  sessions: ClassSessionResponse[];
};

const SESSION_INCLUDE = {
  classSubject: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: true,
        },
      },
    },
  },
  instructor: {
    select: {
      id: true,
      name: true,
      loginId: true,
    },
  },
  canceledBy: {
    select: {
      id: true,
      name: true,
    },
  },
  journalWrittenBy: {
    select: {
      id: true,
      name: true,
    },
  },
  journalUpdatedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export type SessionJournalHistoryResponse = {
  id: string;
  previousTitle: string | null;
  previousLessonContent: string | null;
  newTitle: string;
  newLessonContent: string;
  changedBy: { id: string; name: string } | null;
  changedAt: string;
};

@Injectable()
export class ClassSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionMaintenance: SessionMaintenanceService,
  ) {}

  async findAll(
    classId: string,
    range: ClassSessionRangeDto,
    actor: AuthenticatedUser,
  ): Promise<ClassSessionResponse[]> {
    await this.assertClassAccess(classId, actor);

    const { rangeStart, rangeEndExclusive } = this.validateRange(range);
    await this.sessionMaintenance.runIfStale();

    const sessions = await this.prisma.classSession.findMany({
      where: {
        classId,
        startsAt: {
          gte: rangeStart,
          lt: rangeEndExclusive,
        },
      },
      include: SESSION_INCLUDE,
      orderBy: {
        startsAt: 'asc',
      },
    });

    return sessions.map((session) => this.toResponse(session));
  }

  async generate(
    classId: string,
    range: ClassSessionRangeDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionGenerationResponse> {
    const { startDate, endDate, rangeStart, rangeEndExclusive } =
      this.validateRange(range);

    // 강사는 담당 교육과정이 포함된 반의 수업만 생성할 수 있다.
    await this.assertClassAccess(classId, actor);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM classes
        WHERE id = ${classId}::uuid
        FOR UPDATE
      `;

      const classItem = await tx.class.findFirst({
        where: {
          id: classId,
        },
      });

      if (!classItem) {
        throw new NotFoundException('반을 찾을 수 없습니다.');
      }

      if (classItem.archivedAt) {
        throw new ConflictException('보관된 반에는 수업을 생성할 수 없습니다.');
      }

      const classStartDate = this.toDateString(classItem.startDate);
      const classEndDate = this.toDateString(classItem.endDate);

      if (range.startDate < classStartDate || range.endDate > classEndDate) {
        throw new BadRequestException(
          `수업 생성 기간은 반 운영 기간(${classStartDate}~${classEndDate}) 안에 있어야 합니다.`,
        );
      }

      const patterns = await tx.classSchedulePattern.findMany({
        where: {
          classId,
          active: true,
        },
        include: {
          classSubject: {
            include: {
              courseOfferingSubject: {
                include: {
                  subject: true,
                },
              },
            },
          },
          classProgram: {
            include: {
              courseOffering: {
                include: {
                  instructor: true,
                },
              },
            },
          },
        },
        orderBy: [
          {
            dayOfWeek: 'asc',
          },
          {
            startTime: 'asc',
          },
        ],
      });

      if (patterns.length === 0) {
        throw new ConflictException('활성화된 반복 시간표가 없습니다.');
      }

      const existingSessions = await tx.classSession.findMany({
        where: {
          classId,
          schedulePatternId: {
            not: null,
          },
          startsAt: {
            gte: rangeStart,
            lt: rangeEndExclusive,
          },
        },
        select: {
          id: true,
          schedulePatternId: true,
          classSubjectId: true,
          instructorId: true,
          startsAt: true,
          endsAt: true,
          room: true,
          status: true,
          kind: true,
        },
      });

      const desiredSessions: Array<{
        classId: string;
        classProgramId: string;
        classSubjectId: string;
        courseOfferingSubjectId: string;
        schedulePatternId: string;
        instructorId: string;
        kind: SessionKind;
        title: string;
        startsAt: Date;
        endsAt: Date;
        room: string | null;
        status: SessionStatus;
        createdById: string;
      }> = [];

      for (
        let date = new Date(startDate);
        date <= endDate;
        date = this.addDays(date, 1)
      ) {
        const dateString = this.toDateString(date);
        const dayOfWeek = this.toDayOfWeek(date);

        const dayPatterns = patterns.filter(
          (pattern) => pattern.dayOfWeek === dayOfWeek,
        );

        if (dayPatterns.length === 0) {
          continue;
        }

        for (const pattern of dayPatterns) {
          const startTime = this.toTimeString(pattern.startTime);
          const endTime = this.toTimeString(pattern.endTime);

          const startsAt = new Date(`${dateString}T${startTime}:00+09:00`);
          const endsAt = new Date(`${dateString}T${endTime}:00+09:00`);

          desiredSessions.push({
            classId,
            classProgramId: pattern.classProgram.id,
            classSubjectId: pattern.classSubjectId,
            courseOfferingSubjectId:
              pattern.classSubject.courseOfferingSubjectId,
            schedulePatternId: pattern.id,
            instructorId: pattern.classProgram.courseOffering.instructor.id,
            kind: SessionKind.REGULAR,
            title: pattern.classProgram.courseOffering.name,
            startsAt,
            endsAt,
            room: pattern.room ?? classItem.room,
            status: SessionStatus.SCHEDULED,
            createdById: actor.id,
          });
        }
      }

      const desiredKeys = new Set(
        desiredSessions.map((session) => this.toGeneratedSessionKey(session)),
      );
      const staleSessions = existingSessions.filter(
        (session) =>
          session.status === SessionStatus.SCHEDULED &&
          session.kind === SessionKind.REGULAR &&
          !desiredKeys.has(this.toGeneratedSessionKey(session)),
      );
      const staleSessionIds = staleSessions.map((session) => session.id);

      if (staleSessionIds.length > 0) {
        const participantCount = await tx.sessionParticipant.count({
          where: { classSessionId: { in: staleSessionIds } },
        });
        const attendanceCount = await tx.attendanceRecord.count({
          where: { classSessionId: { in: staleSessionIds } },
        });

        if (participantCount > 0 || attendanceCount > 0) {
          throw new ConflictException(
            '변경 전 예정 수업에 참여자 또는 출석 기록이 있어 자동 동기화할 수 없습니다.',
          );
        }

        await tx.classSession.deleteMany({
          where: { id: { in: staleSessionIds } },
        });
      }

      const staleIdSet = new Set(staleSessionIds);
      const existingKeys = new Set(
        existingSessions
          .filter((session) => !staleIdSet.has(session.id))
          .map((session) => this.toGeneratedSessionKey(session)),
      );
      const candidates = desiredSessions.filter(
        (session) => !existingKeys.has(this.toGeneratedSessionKey(session)),
      );
      const skippedCount = desiredSessions.length - candidates.length;

      if (candidates.length > 0) {
        await tx.classSession.createMany({
          data: candidates,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SESSIONS_GENERATED',
          resourceType: 'CLASS',
          resourceId: classId,
          afterData: {
            startDate: range.startDate,
            endDate: range.endDate,
            createdCount: candidates.length,
            removedCount: staleSessionIds.length,
            skippedCount,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        createdCount: candidates.length,
        removedCount: staleSessionIds.length,
        skippedCount,
      };
    });

    const sessions = await this.findAll(classId, range, actor);

    return {
      ...result,
      sessions,
    };
  }

  async update(
    classId: string,
    sessionId: string,
    dto: UpdateClassSessionDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM class_sessions
        WHERE id = ${sessionId}::uuid
        FOR UPDATE
      `;

      const current = await tx.classSession.findFirst({
        where: {
          id: sessionId,
          classId,
        },
        include: { class: true },
      });

      if (!current) {
        throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
      }

      this.assertSessionActor(current.instructorId, actor);

      if (
        current.status === SessionStatus.COMPLETED ||
        current.status === SessionStatus.CANCELED
      ) {
        throw new ConflictException(
          '완료되거나 취소된 수업은 수정할 수 없습니다.',
        );
      }

      const scheduleChanged =
        dto.startsAt !== undefined || dto.endsAt !== undefined;

      if (scheduleChanged && current.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException(
          '예정 상태의 수업만 시간을 변경할 수 있습니다.',
        );
      }

      const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
      const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;

      if (startsAt >= endsAt) {
        throw new BadRequestException(
          '종료 시각은 시작 시각보다 늦어야 합니다.',
        );
      }

      if (this.toSeoulDateString(startsAt) !== this.toSeoulDateString(endsAt)) {
        throw new BadRequestException(
          '수업 시작과 종료는 같은 날짜여야 합니다.',
        );
      }

      const sessionDate = this.toSeoulDateString(startsAt);
      const classStartDate = this.toDateString(current.class.startDate);
      const classEndDate = this.toDateString(current.class.endDate);

      if (sessionDate < classStartDate || sessionDate > classEndDate) {
        throw new BadRequestException(
          '수업 일자는 반 운영 기간 안에 있어야 합니다.',
        );
      }

      if (scheduleChanged) {
        const overlapping = await tx.classSession.findFirst({
          where: {
            id: { not: current.id },
            classId,
            status: { not: SessionStatus.CANCELED },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { id: true },
        });

        if (overlapping) {
          throw new ConflictException(
            '같은 반에 시간이 겹치는 실제 수업이 있습니다.',
          );
        }
      }

      const title =
        dto.title === undefined ? current.title : this.optionalText(dto.title);
      const lessonContent =
        dto.lessonContent === undefined
          ? current.lessonContent
          : this.optionalText(dto.lessonContent);
      const room =
        dto.room === undefined ? current.room : this.optionalText(dto.room);

      await tx.classSession.update({
        where: { id: current.id },
        data: {
          title,
          lessonContent,
          startsAt,
          endsAt,
          room,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SESSION_UPDATED',
          resourceType: 'CLASS_SESSION',
          resourceId: current.id,
          beforeData: {
            title: current.title,
            lessonContent: current.lessonContent,
            startsAt: current.startsAt.toISOString(),
            endsAt: current.endsAt.toISOString(),
            room: current.room,
          },
          afterData: {
            title,
            lessonContent,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            room,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId, sessionId);
  }

  async changeStatus(
    classId: string,
    sessionId: string,
    dto: ChangeClassSessionStatusDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionResponse> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM class_sessions
        WHERE id = ${sessionId}::uuid
        FOR UPDATE
      `;

      const current = await tx.classSession.findFirst({
        where: {
          id: sessionId,
          classId,
        },
      });

      if (!current) {
        throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
      }

      this.assertSessionActor(current.instructorId, actor);

      const allowedStatus =
        current.status === SessionStatus.SCHEDULED
          ? SessionStatus.IN_PROGRESS
          : current.status === SessionStatus.IN_PROGRESS
            ? SessionStatus.COMPLETED
            : null;

      if (dto.status !== allowedStatus) {
        throw new ConflictException(
          `${current.status} 상태에서 ${dto.status} 상태로 변경할 수 없습니다.`,
        );
      }

      const now = new Date();
      if (dto.status === SessionStatus.IN_PROGRESS) {
        if (now >= current.endsAt) {
          throw new ConflictException(
            '종료 시각이 지난 수업은 시작할 수 없습니다.',
          );
        }

        if (actor.role === UserRole.INSTRUCTOR) {
          const earliestStart = new Date(
            current.startsAt.getTime() - 5 * 60 * 1000,
          );
          const latestStart = new Date(
            current.startsAt.getTime() + 30 * 60 * 1000,
          );
          if (now < earliestStart || now > latestStart) {
            throw new ConflictException(
              '수업은 예정 시작 5분 전부터 30분 후까지 시작할 수 있습니다.',
            );
          }
        }
      }

      const completedMinutes =
        dto.status === SessionStatus.COMPLETED
          ? (dto.completedMinutes ?? null)
          : null;

      await tx.classSession.update({
        where: { id: current.id },
        data: {
          status: dto.status,
          completedMinutes,
          ...(dto.status === SessionStatus.IN_PROGRESS
            ? { actualStartedAt: now }
            : {}),
          ...(dto.status === SessionStatus.COMPLETED
            ? { actualEndedAt: now }
            : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SESSION_STATUS_CHANGED',
          resourceType: 'CLASS_SESSION',
          resourceId: current.id,
          beforeData: {
            status: current.status,
            completedMinutes: current.completedMinutes,
          },
          afterData: {
            status: dto.status,
            completedMinutes,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId, sessionId);
  }

  async updateJournal(
    classId: string,
    sessionId: string,
    dto: UpdateSessionJournalDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionResponse> {
    const current = await this.prisma.classSession.findFirst({
      where: { id: sessionId, classId },
    });

    if (!current) {
      throw new NotFoundException('수업을 찾을 수 없습니다.');
    }
    this.assertSessionActor(current.instructorId, actor);
    if (
      current.status !== SessionStatus.IN_PROGRESS &&
      current.status !== SessionStatus.COMPLETED
    ) {
      throw new ConflictException(
        '진행 중이거나 완료된 수업에만 수업 일지를 작성할 수 있습니다.',
      );
    }

    const title = dto.title.trim();
    const lessonContent = dto.lessonContent.trim();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const firstWrite = current.journalWrittenAt === null;

      await tx.classSession.update({
        where: { id: current.id },
        data: {
          title,
          lessonContent,
          journalWrittenAt: current.journalWrittenAt ?? now,
          journalWrittenById: current.journalWrittenById ?? actor.id,
          ...(firstWrite
            ? {}
            : { journalUpdatedAt: now, journalUpdatedById: actor.id }),
        },
      });

      // 작성과 수정 모두 이력을 한 건씩 남긴다.
      await tx.classSessionJournalHistory.create({
        data: {
          classSessionId: current.id,
          previousTitle: firstWrite ? null : current.title,
          previousLessonContent: firstWrite ? null : current.lessonContent,
          newTitle: title,
          newLessonContent: lessonContent,
          changedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: current.journalWrittenAt
            ? 'CLASS_SESSION_JOURNAL_UPDATED'
            : 'CLASS_SESSION_JOURNAL_CREATED',
          resourceType: 'CLASS_SESSION',
          resourceId: current.id,
          beforeData: {
            title: current.title,
            lessonContent: current.lessonContent,
          },
          afterData: { title, lessonContent },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId, sessionId);
  }

  /** 수업 일지의 작성·수정 이력을 최신순으로 반환한다. */
  async findJournalHistories(
    classId: string,
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<SessionJournalHistoryResponse[]> {
    const session = await this.prisma.classSession.findFirst({
      where: { id: sessionId, classId },
      select: { id: true, instructorId: true },
    });

    if (!session) {
      throw new NotFoundException('수업을 찾을 수 없습니다.');
    }

    this.assertSessionActor(session.instructorId, actor);

    const histories = await this.prisma.classSessionJournalHistory.findMany({
      where: { classSessionId: sessionId },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'desc' },
    });

    return histories.map((history) => ({
      id: history.id,
      previousTitle: history.previousTitle,
      previousLessonContent: history.previousLessonContent,
      newTitle: history.newTitle,
      newLessonContent: history.newLessonContent,
      changedBy: history.changedBy,
      changedAt: history.changedAt.toISOString(),
    }));
  }

  async cancel(
    classId: string,
    sessionId: string,
    dto: CancelClassSessionDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionResponse> {
    const reason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT id
      FROM class_sessions
      WHERE id = ${sessionId}::uuid
      FOR UPDATE
    `;

      const current = await tx.classSession.findFirst({
        where: {
          id: sessionId,
          classId,
        },
      });

      if (!current) {
        throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
      }

      if (
        current.status === SessionStatus.COMPLETED ||
        current.status === SessionStatus.CANCELED
      ) {
        throw new ConflictException(
          '완료되거나 이미 취소된 수업은 취소할 수 없습니다.',
        );
      }

      const canceledAt = new Date();

      const revokedCodes = await tx.attendanceCode.updateMany({
        where: {
          classSessionId: current.id,
          status: AttendanceCodeStatus.ACTIVE,
        },
        data: {
          status: AttendanceCodeStatus.REVOKED,
          revokedAt: canceledAt,
        },
      });

      await tx.classSession.update({
        where: {
          id: current.id,
        },
        data: {
          status: SessionStatus.CANCELED,
          canceledAt,
          canceledById: actor.id,
          cancelReason: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SESSION_CANCELED',
          resourceType: 'CLASS_SESSION',
          resourceId: current.id,
          beforeData: {
            status: current.status,
            canceledAt: current.canceledAt?.toISOString() ?? null,
            canceledById: current.canceledById,
            cancelReason: current.cancelReason,
          },
          afterData: {
            status: SessionStatus.CANCELED,
            canceledAt: canceledAt.toISOString(),
            canceledById: actor.id,
            cancelReason: reason,
            revokedAttendanceCodeCount: revokedCodes.count,
          },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(classId, sessionId);
  }

  async createMakeup(
    classId: string,
    originalSessionId: string,
    dto: CreateMakeupSessionDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionResponse> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const reason = dto.reason.trim();

    if (startsAt >= endsAt) {
      throw new BadRequestException(
        '보강 종료 시각은 시작 시각보다 늦어야 합니다.',
      );
    }

    if (this.toSeoulDateString(startsAt) !== this.toSeoulDateString(endsAt)) {
      throw new BadRequestException('보강 시작과 종료는 같은 날짜여야 합니다.');
    }

    const makeupId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM class_sessions
        WHERE id = ${originalSessionId}::uuid
        FOR UPDATE
      `;

      const original = await tx.classSession.findFirst({
        where: {
          id: originalSessionId,
          classId,
        },
        include: {
          class: true,
          classProgram: {
            include: {
              courseOffering: { select: { instructorId: true } },
            },
          },
          classSubject: {
            include: {
              courseOfferingSubject: {
                include: {
                  subject: true,
                },
              },
            },
          },
        },
      });

      if (!original) {
        throw new NotFoundException('보강 대상 원수업을 찾을 수 없습니다.');
      }

      if (original.kind !== SessionKind.REGULAR) {
        throw new ConflictException('정규 수업만 보강 대상이 될 수 있습니다.');
      }

      if (original.status !== SessionStatus.CANCELED) {
        throw new ConflictException(
          '취소된 수업에 대해서만 보강 수업을 만들 수 있습니다.',
        );
      }

      const sessionDate = this.toSeoulDateString(startsAt);
      const classStartDate = this.toDateString(original.class.startDate);
      const classEndDate = this.toDateString(original.class.endDate);

      if (sessionDate < classStartDate || sessionDate > classEndDate) {
        throw new BadRequestException(
          '보강 일자는 반 운영 기간 안에 있어야 합니다.',
        );
      }

      const existingMakeup = await tx.classSession.findFirst({
        where: {
          replacementForSessionId: original.id,
          status: {
            not: SessionStatus.CANCELED,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingMakeup) {
        throw new ConflictException(
          '이미 취소되지 않은 보강 수업이 존재합니다.',
        );
      }

      // 반 학생은 반에 포함된 모든 교육과정을 수강하므로, 겹침 검사는
      // 같은 교육과정이 아니라 반 전체의 수업을 대상으로 해야 한다.
      const overlapping = await tx.classSession.findFirst({
        where: {
          classId,
          status: {
            not: SessionStatus.CANCELED,
          },
          startsAt: {
            lt: endsAt,
          },
          endsAt: {
            gt: startsAt,
          },
        },
        select: {
          id: true,
        },
      });

      if (overlapping) {
        throw new ConflictException('같은 반에 시간이 겹치는 수업이 있습니다.');
      }

      const defaultTitle = `${
        original.title ??
        original.classSubject.courseOfferingSubject.subject.name
      } 보강`;

      const created = await tx.classSession.create({
        data: {
          classId,
          classSubjectId: original.classSubjectId,
          courseOfferingSubjectId: original.courseOfferingSubjectId,
          classProgramId: original.classProgramId,
          schedulePatternId: null,
          instructorId: original.classProgram.courseOffering.instructorId,
          kind: SessionKind.MAKEUP,
          replacementForSessionId: original.id,
          title: this.optionalText(dto.title) ?? defaultTitle,
          startsAt,
          endsAt,
          room:
            this.optionalText(dto.room) ?? original.room ?? original.class.room,
          status: SessionStatus.SCHEDULED,
          createdById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'MAKEUP_SESSION_CREATED',
          resourceType: 'CLASS_SESSION',
          resourceId: created.id,
          afterData: {
            originalSessionId: original.id,
            classId,
            classSubjectId: original.classSubjectId,
            instructorId: original.classProgram.courseOffering.instructorId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            room: created.room,
            status: created.status,
          },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created.id;
    });

    return this.findOne(classId, makeupId);
  }

  private async findOne(
    classId: string,
    sessionId: string,
  ): Promise<ClassSessionResponse> {
    const session = await this.prisma.classSession.findFirst({
      where: {
        id: sessionId,
        classId,
      },
      include: SESSION_INCLUDE,
    });

    if (!session) {
      throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
    }

    return this.toResponse(session);
  }

  private validateRange(range: ClassSessionRangeDto): {
    startDate: Date;
    endDate: Date;
    rangeStart: Date;
    rangeEndExclusive: Date;
  } {
    const startDate = new Date(`${range.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${range.endDate}T00:00:00.000Z`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('올바른 날짜를 입력해야 합니다.');
    }

    if (
      this.toDateString(startDate) !== range.startDate ||
      this.toDateString(endDate) !== range.endDate
    ) {
      throw new BadRequestException('존재하지 않는 날짜가 포함되어 있습니다.');
    }

    if (startDate > endDate) {
      throw new BadRequestException('종료일은 시작일보다 빠를 수 없습니다.');
    }

    const differenceDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
      ) + 1;

    if (differenceDays > 366) {
      throw new BadRequestException(
        '한 번에 생성하거나 조회할 수 있는 기간은 최대 366일입니다.',
      );
    }

    return {
      startDate,
      endDate,
      rangeStart: new Date(`${range.startDate}T00:00:00+09:00`),
      rangeEndExclusive: new Date(
        `${this.toDateString(this.addDays(endDate, 1))}T00:00:00+09:00`,
      ),
    };
  }

  private async assertClassAccess(
    classId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const classItem = await this.prisma.class.findFirst({
      where: {
        id: classId,
      },
      select: {
        id: true,
      },
    });

    if (!classItem) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }

    if (actor.role === UserRole.INSTRUCTOR) {
      const assignmentCount = await this.prisma.classProgram.count({
        where: {
          classId,
          courseOffering: { instructorId: actor.id },
        },
      });

      if (assignmentCount === 0) {
        throw new ForbiddenException(
          '담당 이력이 있는 반의 수업만 조회할 수 있습니다.',
        );
      }
    }
  }

  private assertSessionActor(
    instructorId: string,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role === UserRole.INSTRUCTOR && instructorId !== actor.id) {
      throw new ForbiddenException(
        '본인이 담당하는 수업만 관리할 수 있습니다.',
      );
    }
  }

  private optionalText(value?: string): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  private toSeoulDateString(date: Date): string {
    return toSeoulDateString(date);
  }

  private toGeneratedSessionKey(session: {
    schedulePatternId: string | null;
    classSubjectId: string;
    instructorId: string;
    startsAt: Date;
    endsAt: Date;
    room: string | null;
  }): string {
    return [
      session.schedulePatternId,
      session.classSubjectId,
      session.instructorId,
      session.startsAt.toISOString(),
      session.endsAt.toISOString(),
      session.room ?? '',
    ].join('|');
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);

    return result;
  }

  private toDayOfWeek(date: Date): number {
    const day = date.getUTCDay();

    return day === 0 ? 7 : day;
  }

  private toDateString(date: Date): string {
    return toSeoulDateString(date);
  }

  private toTimeString(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  private toResponse(session: {
    id: string;
    classId: string;
    classSubjectId: string;
    courseOfferingSubjectId: string;
    schedulePatternId: string | null;
    kind: SessionKind;
    title: string | null;
    lessonContent: string | null;
    startsAt: Date;
    endsAt: Date;
    room: string | null;
    status: SessionStatus;
    completedMinutes: number | null;
    journalWrittenAt: Date | null;
    journalWrittenBy: { id: string; name: string } | null;
    journalUpdatedAt: Date | null;
    journalUpdatedBy: { id: string; name: string } | null;
    createdAt: Date;
    updatedAt: Date;
    classSubject: {
      courseOfferingSubject: {
        subject: {
          id: string;
          name: string;
        };
      };
    };
    instructor: {
      id: string;
      name: string;
      loginId: string | null;
    };
    replacementForSessionId: string | null;
    canceledAt: Date | null;
    cancelReason: string | null;
    canceledBy: {
      id: string;
      name: string;
    } | null;
  }): ClassSessionResponse {
    return {
      id: session.id,
      classId: session.classId,
      classSubjectId: session.classSubjectId,
      courseOfferingSubjectId: session.courseOfferingSubjectId,
      schedulePatternId: session.schedulePatternId,
      subjectId: session.classSubject.courseOfferingSubject.subject.id,
      subjectName: session.classSubject.courseOfferingSubject.subject.name,
      instructor: session.instructor,
      kind: session.kind,
      title: session.title,
      lessonContent: session.lessonContent,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      room: session.room,
      status: session.status,
      completedMinutes: session.completedMinutes,
      journalWrittenAt: session.journalWrittenAt?.toISOString() ?? null,
      journalWrittenBy: session.journalWrittenBy,
      journalUpdatedAt: session.journalUpdatedAt?.toISOString() ?? null,
      journalUpdatedBy: session.journalUpdatedBy,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      replacementForSessionId: session.replacementForSessionId,
      canceledAt: session.canceledAt?.toISOString() ?? null,
      canceledBy: session.canceledBy,
      cancelReason: session.cancelReason,
    };
  }
}
