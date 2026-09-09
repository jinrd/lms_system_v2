import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  AttendanceCodeAttemptResult,
  AttendanceCodeStatus,
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
  SessionStatus,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { computeAttendanceBucket } from '../common/attendance-rate';
import { toSeoulEndOfDay } from '../common/seoul-date';
import { SessionMaintenanceService } from '../maintenance/session-maintenance.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SubmitAttendanceCodeDto } from './dto/submit-attendance-code.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

export type AttendanceCodeMetadataResponse = {
  id: string;
  classSessionId: string;
  generatedBy: {
    id: string;
    name: string;
  };
  generatedAt: string;
  expiresAt: string;
};

export type AttendanceCodeGenerationResponse =
  AttendanceCodeMetadataResponse & {
    code: string;
  };

export type AttendanceSubmissionResponse = {
  attendanceRecordId: string;
  classSessionId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  checkedAt: string;
  /** 이미 처리된 출석이라 새로 기록하지 않고 기존 결과를 돌려준 경우다. */
  alreadyProcessed: boolean;
};

type IpRateState = {
  windowStartedAt: number;
  count: number;
};
export type StudentAttendanceSessionResponse = {
  id: string;
  classId: string;
  className: string;
  courseOfferingId: string;
  courseOfferingName: string;
  subjectName: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: SessionStatus;
  codeAvailable: boolean;
  attendance: {
    id: string;
    status: AttendanceStatus;
    method: AttendanceMethod | null;
    checkedAt: string | null;
  } | null;
};

@Injectable()
export class AttendanceService {
  private readonly attendanceCodeSecret: string;
  private readonly ipRateStates = new Map<string, IpRateState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly sessionMaintenance: SessionMaintenanceService,
    private readonly settings: SettingsService,
  ) {
    this.attendanceCodeSecret = this.configService.getOrThrow<string>(
      'ATTENDANCE_CODE_SECRET',
    );
  }
  /**
   * 학생 본인의 출석률 요약이다.
   * 출석·지각 1.0, 조퇴 0.5, 결석 0으로 계산하고 공결·미처리는 분모에서 제외한다.
   * 휴강 수업은 출석 기록이 있어도 계산에서 뺀다.
   */
  async findMyAttendanceSummary(actor: AuthenticatedUser): Promise<{
    present: number;
    late: number;
    absent: number;
    earlyLeave: number;
    excused: number;
    unprocessed: number;
    countedTotal: number;
    attendanceRate: number | null;
  }> {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        '학생 계정만 본인의 출석률을 조회할 수 있습니다.',
      );
    }

    await this.sessionMaintenance.runIfStale();

    const grouped = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        studentId: actor.id,
        classSession: { status: { not: SessionStatus.CANCELED } },
      },
      _count: { _all: true },
    });

    const countOf = (status: AttendanceStatus): number =>
      grouped.find((item) => item.status === status)?._count._all ?? 0;

    const bucket = computeAttendanceBucket({
      present: countOf(AttendanceStatus.PRESENT),
      late: countOf(AttendanceStatus.LATE),
      absent: countOf(AttendanceStatus.ABSENT),
      earlyLeave: countOf(AttendanceStatus.EARLY_LEAVE),
      excused: countOf(AttendanceStatus.EXCUSED),
      unprocessed: countOf(AttendanceStatus.UNPROCESSED),
    });

    return {
      present: bucket.present,
      late: bucket.late,
      absent: bucket.absent,
      earlyLeave: bucket.earlyLeave,
      excused: bucket.excused,
      unprocessed: bucket.unprocessed,
      countedTotal: bucket.countedTotal,
      attendanceRate: bucket.attendanceRate,
    };
  }

  async findMySessions(
    actor: AuthenticatedUser,
  ): Promise<StudentAttendanceSessionResponse[]> {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        '학생 계정만 본인의 출석 대상 수업을 조회할 수 있습니다.',
      );
    }

    const now = new Date();
    await this.sessionMaintenance.runIfStale();
    const seoulDateString = now.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Seoul',
    });

    const today = new Date(`${seoulDateString}T00:00:00.000Z`);
    const rangeStart = new Date(`${seoulDateString}T00:00:00+09:00`);
    const rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);

    const [sessions, enrollmentSubjects, participants] =
      await this.prisma.$transaction(async (tx) => {
        const sessions = await tx.classSession.findMany({
          where: {
            OR: [
              {
                startsAt: { gte: rangeStart, lt: rangeEnd },
                status: {
                  in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS],
                },
              },
              { status: SessionStatus.IN_PROGRESS, endsAt: { gt: now } },
            ],
          },
          include: {
            class: {
              select: {
                id: true,
                name: true,
              },
            },
            classProgram: {
              select: {
                courseOfferingId: true,
                courseOffering: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            courseOfferingSubject: {
              include: {
                subject: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            attendanceCodes: {
              where: {
                status: AttendanceCodeStatus.ACTIVE,
                expiresAt: {
                  gt: now,
                },
              },
              select: {
                id: true,
              },
              take: 1,
            },
            attendanceRecords: {
              where: {
                studentId: actor.id,
              },
              select: {
                id: true,
                status: true,
                method: true,
                checkedAt: true,
              },
              take: 1,
            },
          },
          orderBy: {
            startsAt: 'asc',
          },
        });
        const enrollmentSubjects = await tx.enrollmentSubject.findMany({
          where: {
            attendanceManaged: true,
            startsOn: {
              lte: today,
            },
            OR: [
              {
                endsOn: null,
              },
              {
                endsOn: {
                  gte: today,
                },
              },
            ],
            enrollment: {
              studentId: actor.id,
              attendanceManaged: true,
              status: EnrollmentStatus.ACTIVE,
              startsOn: {
                lte: today,
              },
              OR: [
                {
                  endsOn: null,
                },
                {
                  endsOn: {
                    gte: today,
                  },
                },
              ],
            },
          },
          select: {
            courseOfferingSubjectId: true,
            enrollment: {
              select: {
                classId: true,
              },
            },
          },
        });
        const participants = await tx.sessionParticipant.findMany({
          where: {
            studentId: actor.id,
            classSession: {
              startsAt: {
                gte: rangeStart,
                lt: rangeEnd,
              },
            },
          },
          select: {
            classSessionId: true,
          },
        });
        return [sessions, enrollmentSubjects, participants] as const;
      });

    const normalParticipationKeys = new Set(
      enrollmentSubjects.map(
        (subject) =>
          `${subject.enrollment.classId}:${subject.courseOfferingSubjectId}`,
      ),
    );

    const individualSessionIds = new Set(
      participants.map((participant) => participant.classSessionId),
    );

    return sessions
      .filter(
        (session) =>
          normalParticipationKeys.has(
            `${session.classId}:${session.courseOfferingSubjectId}`,
          ) || individualSessionIds.has(session.id),
      )
      .map((session) => {
        const attendance = session.attendanceRecords[0] ?? null;

        return {
          id: session.id,
          classId: session.classId,
          className: session.class.name,
          courseOfferingId: session.classProgram.courseOfferingId,
          courseOfferingName: session.classProgram.courseOffering.name,
          subjectName: session.courseOfferingSubject.subject.name,
          title: session.title,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          room: session.room,
          status: session.status,
          codeAvailable: session.attendanceCodes.length > 0,
          attendance: attendance
            ? {
                id: attendance.id,
                status: attendance.status,
                method: attendance.method,
                checkedAt: attendance.checkedAt?.toISOString() ?? null,
              }
            : null,
        };
      });
  }

  async findSessionAttendance(sessionId: string, actor: AuthenticatedUser) {
    const session = await this.prisma.classSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        instructorId: true,
        classId: true,
        courseOfferingSubjectId: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });
    if (!session) {
      throw new NotFoundException('수업을 찾을 수 없습니다.');
    }
    this.assertAttendanceManager(session.instructorId, actor);

    const enrollmentSubjects = await this.prisma.enrollmentSubject.findMany({
      where: {
        courseOfferingSubjectId: session.courseOfferingSubjectId,
        enrollment: {
          classId: session.classId,
          status: EnrollmentStatus.ACTIVE,
        },
      },
      select: {
        id: true,
        enrollmentId: true,
        enrollment: { select: { studentId: true } },
      },
    });

    const now = new Date();
    // 휴강 수업은 출석률에서 제외하므로 자동 결석 대상이 아니다.
    const ended =
      session.endsAt <= now && session.status !== SessionStatus.CANCELED;
    if (ended && session.status === SessionStatus.IN_PROGRESS) {
      await this.prisma.classSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.COMPLETED, actualEndedAt: now },
      });
    } else if (
      session.status === SessionStatus.SCHEDULED &&
      session.startsAt <= now &&
      session.endsAt > now
    ) {
      await this.prisma.classSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.IN_PROGRESS, actualStartedAt: now },
      });
    }

    await this.prisma.attendanceRecord.createMany({
      data: enrollmentSubjects.map((item) => ({
        classSessionId: session.id,
        courseOfferingSubjectId: session.courseOfferingSubjectId,
        enrollmentId: item.enrollmentId,
        enrollmentSubjectId: item.id,
        studentId: item.enrollment.studentId,
        status: ended ? AttendanceStatus.ABSENT : AttendanceStatus.UNPROCESSED,
        method: ended ? AttendanceMethod.SYSTEM_AUTO : null,
      })),
      skipDuplicates: true,
    });

    const records = await this.prisma.attendanceRecord.findMany({
      where: { classSessionId: session.id },
      include: {
        student: { select: { id: true, loginId: true, name: true } },
        changeHistories: {
          include: {
            changedBy: { select: { id: true, name: true } },
          },
          orderBy: { changedAt: 'desc' },
        },
      },
      orderBy: { student: { name: 'asc' } },
    });

    return records.map((record) => ({
      id: record.id,
      student: record.student,
      status: record.status,
      method: record.method,
      checkedAt: record.checkedAt?.toISOString() ?? null,
      updatedAt: record.updatedAt.toISOString(),
      histories: record.changeHistories.map((history) => ({
        id: history.id,
        previousStatus: history.previousStatus,
        newStatus: history.newStatus,
        previousCheckedAt: history.previousCheckedAt?.toISOString() ?? null,
        newCheckedAt: history.newCheckedAt?.toISOString() ?? null,
        reason: history.reason,
        changedBy: history.changedBy,
        changedAt: history.changedAt.toISOString(),
      })),
    }));
  }

  async updateAttendance(
    sessionId: string,
    attendanceRecordId: string,
    dto: UpdateAttendanceDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id: attendanceRecordId, classSessionId: sessionId },
      include: {
        classSession: { select: { instructorId: true, startsAt: true } },
        student: { select: { id: true, loginId: true, name: true } },
      },
    });
    if (!record) {
      throw new NotFoundException('출석 기록을 찾을 수 없습니다.');
    }
    this.assertAttendanceManager(record.classSession.instructorId, actor);

    // 강사는 수업이 진행된 날의 23:59:59(KST)까지만 수정할 수 있다.
    // 실장·원장·관리자는 기간 제한이 없다(기획안 §11.3 / D-04).
    if (
      actor.role === UserRole.INSTRUCTOR &&
      new Date() > toSeoulEndOfDay(record.classSession.startsAt)
    ) {
      throw new ForbiddenException(
        '강사는 수업이 진행된 날의 자정 전까지만 출석을 수정할 수 있습니다. 이후에는 실장·원장·관리자에게 요청하세요.',
      );
    }

    const arrivalRequired =
      dto.status === AttendanceStatus.PRESENT ||
      dto.status === AttendanceStatus.LATE ||
      dto.status === AttendanceStatus.EARLY_LEAVE;
    if (arrivalRequired && !dto.checkedAt) {
      throw new BadRequestException(
        '출석·지각·조퇴 처리에는 학생이 실제로 도착한 시각이 필요합니다.',
      );
    }

    const checkedAt = arrivalRequired ? (dto.checkedAt ?? null) : null;
    const method = this.manualMethod(actor.role);
    const reason = dto.reason.trim();

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.attendanceRecord.update({
        where: { id: record.id },
        data: {
          status: dto.status,
          checkedAt,
          method,
          processedById: actor.id,
        },
        include: {
          student: { select: { id: true, loginId: true, name: true } },
        },
      });
      await tx.attendanceChangeHistory.create({
        data: {
          attendanceRecordId: record.id,
          previousStatus: record.status,
          newStatus: dto.status,
          previousCheckedAt: record.checkedAt,
          newCheckedAt: checkedAt,
          reason,
          changedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ATTENDANCE_MANUALLY_CHANGED',
          resourceType: 'ATTENDANCE_RECORD',
          resourceId: record.id,
          beforeData: {
            status: record.status,
            checkedAt: record.checkedAt?.toISOString() ?? null,
          },
          afterData: {
            status: dto.status,
            checkedAt: checkedAt?.toISOString() ?? null,
          },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });
      return next;
    });

    return {
      id: updated.id,
      student: updated.student,
      status: updated.status,
      method: updated.method,
      checkedAt: updated.checkedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
  async findCurrentCode(
    classId: string,
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCodeMetadataResponse | null> {
    const session = await this.findSession(classId, sessionId);

    this.assertCodeManager(session.instructorId, actor);

    const now = new Date();

    await this.prisma.attendanceCode.updateMany({
      where: {
        classSessionId: sessionId,
        status: AttendanceCodeStatus.ACTIVE,
        expiresAt: {
          lte: now,
        },
      },
      data: {
        status: AttendanceCodeStatus.EXPIRED,
      },
    });

    const attendanceCode = await this.prisma.attendanceCode.findFirst({
      where: {
        classSessionId: sessionId,
        status: AttendanceCodeStatus.ACTIVE,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        generatedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        generatedAt: 'desc',
      },
    });

    if (!attendanceCode) {
      return null;
    }

    return {
      id: attendanceCode.id,
      classSessionId: attendanceCode.classSessionId,
      generatedBy: attendanceCode.generatedBy,
      generatedAt: attendanceCode.generatedAt.toISOString(),
      expiresAt: attendanceCode.expiresAt.toISOString(),
    };
  }

  async generateCode(
    classId: string,
    sessionId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<AttendanceCodeGenerationResponse> {
    const now = new Date();
    const code = randomInt(0, 10_000).toString().padStart(4, '0');
    // 코드 유효 시간은 운영 중 조정 가능한 정책값이다(기획안 §22).
    const codeValidMinutes = await this.settings.getNumber(
      'attendance.code_valid_minutes',
    );

    const generated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM class_sessions
        WHERE id = ${sessionId}::uuid
        FOR UPDATE
      `;

      const session = await tx.classSession.findFirst({
        where: {
          id: sessionId,
          classId,
        },
        include: {
          instructor: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!session) {
        throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
      }

      this.assertCodeManager(session.instructorId, actor);

      if (session.instructor.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 담당 강사가 있는 수업만 출석 코드를 생성할 수 있습니다.',
        );
      }

      if (
        session.status === SessionStatus.COMPLETED ||
        session.status === SessionStatus.CANCELED
      ) {
        throw new ConflictException(
          '완료되거나 취소된 수업에는 출석 코드를 생성할 수 없습니다.',
        );
      }

      if (session.status !== SessionStatus.IN_PROGRESS) {
        throw new ConflictException(
          '진행 중인 수업에서만 출석 코드를 생성할 수 있습니다.',
        );
      }

      if (now >= session.endsAt) {
        throw new ConflictException('종료 시각이 지난 수업입니다.');
      }

      const expiresAt = new Date(
        Math.min(
          now.getTime() + codeValidMinutes * 60 * 1000,
          session.endsAt.getTime(),
        ),
      );

      await tx.attendanceCode.updateMany({
        where: {
          classSessionId: session.id,
          status: AttendanceCodeStatus.ACTIVE,
        },
        data: {
          status: AttendanceCodeStatus.REVOKED,
          revokedAt: now,
        },
      });

      const attendanceCode = await tx.attendanceCode.create({
        data: {
          classSessionId: session.id,
          codeHash: this.hashCode(session.id, code),
          status: AttendanceCodeStatus.ACTIVE,
          generatedById: actor.id,
          generatedAt: now,
          expiresAt,
        },
        include: {
          generatedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'ATTENDANCE_CODE_GENERATED',
          resourceType: 'ATTENDANCE_CODE',
          resourceId: attendanceCode.id,
          afterData: {
            classSessionId: session.id,
            expiresAt: expiresAt.toISOString(),
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return attendanceCode;
    });

    return {
      id: generated.id,
      classSessionId: generated.classSessionId,
      code,
      generatedBy: generated.generatedBy,
      generatedAt: generated.generatedAt.toISOString(),
      expiresAt: generated.expiresAt.toISOString(),
    };
  }

  async submitCode(
    dto: SubmitAttendanceCodeDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AttendanceSubmissionResponse> {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException(
        '학생 계정만 출석 코드를 입력할 수 있습니다.',
      );
    }

    this.assertIpRateLimit(ipAddress);

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM attendance_codes
        WHERE class_session_id = ${dto.classSessionId}::uuid
          AND status = 'ACTIVE'::attendance_code_status
        FOR UPDATE
      `;

      const attendanceCode = await tx.attendanceCode.findFirst({
        where: {
          classSessionId: dto.classSessionId,
          status: AttendanceCodeStatus.ACTIVE,
        },
        include: {
          classSession: {
            include: {
              classProgram: {
                select: {
                  courseOfferingId: true,
                },
              },
            },
          },
        },
        orderBy: {
          generatedAt: 'desc',
        },
      });

      if (!attendanceCode) {
        throw new NotFoundException(
          '현재 사용할 수 있는 출석 코드가 없습니다.',
        );
      }

      if (attendanceCode.expiresAt <= now) {
        throw new ConflictException('출석 코드가 만료되었습니다.');
      }

      const invalidAttemptCount = await tx.attendanceCodeAttempt.count({
        where: {
          attendanceCodeId: attendanceCode.id,
          studentId: actor.id,
          result: AttendanceCodeAttemptResult.INVALID,
        },
      });

      if (invalidAttemptCount >= 5) {
        await tx.attendanceCodeAttempt.create({
          data: {
            attendanceCodeId: attendanceCode.id,
            studentId: actor.id,
            result: AttendanceCodeAttemptResult.BLOCKED,
            ipAddress,
            userAgent,
          },
        });

        return {
          kind: 'BLOCKED' as const,
        };
      }

      const expectedHash = attendanceCode.codeHash;
      const submittedHash = this.hashCode(
        attendanceCode.classSessionId,
        dto.code,
      );

      if (!this.hashesEqual(expectedHash, submittedHash)) {
        await tx.attendanceCodeAttempt.create({
          data: {
            attendanceCodeId: attendanceCode.id,
            studentId: actor.id,
            result: AttendanceCodeAttemptResult.INVALID,
            ipAddress,
            userAgent,
          },
        });

        return {
          kind: 'INVALID' as const,
          remainingAttempts: Math.max(0, 4 - invalidAttemptCount),
        };
      }

      const session = attendanceCode.classSession;
      const sessionDate = this.toSeoulDate(session.startsAt);

      const normalEnrollment = await tx.enrollment.findFirst({
        where: {
          studentId: actor.id,
          classId: session.classId,
          status: EnrollmentStatus.ACTIVE,
          attendanceManaged: true,
          startsOn: {
            lte: sessionDate,
          },
          OR: [
            {
              endsOn: null,
            },
            {
              endsOn: {
                gte: sessionDate,
              },
            },
          ],
          subjects: {
            some: {
              courseOfferingSubjectId: session.courseOfferingSubjectId,
              attendanceManaged: true,
              startsOn: {
                lte: sessionDate,
              },
              OR: [
                {
                  endsOn: null,
                },
                {
                  endsOn: {
                    gte: sessionDate,
                  },
                },
              ],
            },
          },
        },
        include: {
          subjects: {
            where: {
              courseOfferingSubjectId: session.courseOfferingSubjectId,
              attendanceManaged: true,
              startsOn: {
                lte: sessionDate,
              },
              OR: [
                {
                  endsOn: null,
                },
                {
                  endsOn: {
                    gte: sessionDate,
                  },
                },
              ],
            },
            take: 1,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      const individualParticipant = normalEnrollment
        ? null
        : await tx.sessionParticipant.findUnique({
            where: {
              classSessionId_studentId: {
                classSessionId: session.id,
                studentId: actor.id,
              },
            },
            include: {
              sourceEnrollment: true,
              sourceEnrollmentSubject: true,
            },
          });

      const enrollment =
        normalEnrollment ?? individualParticipant?.sourceEnrollment ?? null;

      const enrollmentSubject =
        normalEnrollment?.subjects[0] ??
        individualParticipant?.sourceEnrollmentSubject ??
        null;

      if (!enrollment || !enrollmentSubject) {
        throw new ForbiddenException('해당 실제 수업의 출석 대상이 아닙니다.');
      }

      if (
        enrollment.courseOfferingId !== session.classProgram.courseOfferingId ||
        enrollment.studentId !== actor.id ||
        enrollmentSubject.courseOfferingSubjectId !==
          session.courseOfferingSubjectId
      ) {
        throw new ForbiddenException(
          '수강 정보와 실제 수업 과목이 일치하지 않습니다.',
        );
      }

      const attendanceStatus = AttendanceStatus.PRESENT;

      const existingRecord = await tx.attendanceRecord.findUnique({
        where: {
          classSessionId_studentId: {
            classSessionId: session.id,
            studentId: actor.id,
          },
        },
      });

      // 이미 출석 처리된 학생의 재입력은 새 기록을 만들지 않는다.
      const alreadyProcessed =
        existingRecord !== null &&
        existingRecord.status !== AttendanceStatus.UNPROCESSED;

      const attendanceRecord = existingRecord
        ? existingRecord.status === AttendanceStatus.UNPROCESSED
          ? await tx.attendanceRecord.update({
              where: {
                id: existingRecord.id,
              },
              data: {
                status: attendanceStatus,
                method: AttendanceMethod.CODE,
                checkedAt: now,
                processedById: null,
              },
            })
          : existingRecord
        : await tx.attendanceRecord.create({
            data: {
              classSessionId: session.id,
              courseOfferingSubjectId: session.courseOfferingSubjectId,
              enrollmentId: enrollment.id,
              enrollmentSubjectId: enrollmentSubject.id,
              sessionParticipantId: individualParticipant?.id ?? null,
              studentId: actor.id,
              status: attendanceStatus,
              method: AttendanceMethod.CODE,
              checkedAt: now,
            },
          });

      await tx.attendanceCodeAttempt.create({
        data: {
          attendanceCodeId: attendanceCode.id,
          studentId: actor.id,
          result: AttendanceCodeAttemptResult.SUCCESS,
          ipAddress,
          userAgent,
        },
      });

      return {
        kind: 'SUCCESS' as const,
        attendanceRecord,
        alreadyProcessed,
      };
    });

    if (result.kind === 'BLOCKED') {
      throw new HttpException(
        '출석 코드 입력 가능 횟수를 초과했습니다.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (result.kind === 'INVALID') {
      throw new BadRequestException(
        `출석 코드가 올바르지 않습니다. 남은 횟수: ${result.remainingAttempts}회`,
      );
    }

    const attendanceRecord = result.attendanceRecord;

    if (!attendanceRecord.method || !attendanceRecord.checkedAt) {
      throw new Error('출석 처리 결과가 올바르지 않습니다.');
    }

    return {
      attendanceRecordId: attendanceRecord.id,
      classSessionId: attendanceRecord.classSessionId,
      status: attendanceRecord.status,
      method: attendanceRecord.method,
      checkedAt: attendanceRecord.checkedAt.toISOString(),
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  private async findSession(
    classId: string,
    sessionId: string,
  ): Promise<{
    id: string;
    instructorId: string;
  }> {
    const session = await this.prisma.classSession.findFirst({
      where: {
        id: sessionId,
        classId,
      },
      select: {
        id: true,
        instructorId: true,
      },
    });

    if (!session) {
      throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
    }

    return session;
  }

  private assertCodeManager(
    instructorId: string,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role !== UserRole.ADMIN && instructorId !== actor.id) {
      throw new ForbiddenException(
        '본인이 담당하는 수업의 출석 코드만 관리할 수 있습니다.',
      );
    }
  }

  private assertAttendanceManager(
    instructorId: string,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('출석을 수정할 권한이 없습니다.');
    }
    if (actor.role === UserRole.INSTRUCTOR && instructorId !== actor.id) {
      throw new ForbiddenException(
        '본인이 담당한 수업의 출석만 수정할 수 있습니다.',
      );
    }
  }

  private manualMethod(role: UserRole): AttendanceMethod {
    const methods: Partial<Record<UserRole, AttendanceMethod>> = {
      [UserRole.INSTRUCTOR]: AttendanceMethod.INSTRUCTOR_MANUAL,
      [UserRole.MANAGER]: AttendanceMethod.MANAGER_MANUAL,
      [UserRole.PRINCIPAL]: AttendanceMethod.PRINCIPAL_MANUAL,
      [UserRole.ADMIN]: AttendanceMethod.ADMIN_MANUAL,
    };
    const method = methods[role];
    if (!method) {
      throw new ForbiddenException('출석을 수정할 권한이 없습니다.');
    }
    return method;
  }

  private hashCode(classSessionId: string, code: string): string {
    return createHmac('sha256', this.attendanceCodeSecret)
      .update(`${classSessionId}:${code}`)
      .digest('hex');
  }

  private hashesEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private toSeoulDate(value: Date): Date {
    const dateString = value.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Seoul',
    });

    return new Date(`${dateString}T00:00:00.000Z`);
  }

  private assertIpRateLimit(ipAddress?: string): void {
    const key = ipAddress || 'unknown';
    const now = Date.now();
    const existing = this.ipRateStates.get(key);

    if (!existing || now - existing.windowStartedAt >= 60_000) {
      this.ipRateStates.set(key, {
        windowStartedAt: now,
        count: 1,
      });

      return;
    }

    if (existing.count >= 300) {
      throw new HttpException(
        '출석 코드 입력 요청이 너무 많습니다.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
  }
}
