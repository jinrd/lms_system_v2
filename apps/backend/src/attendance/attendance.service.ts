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
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAttendanceCodeDto } from './dto/submit-attendance-code.dto';

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
};

type IpRateState = {
  windowStartedAt: number;
  count: number;
};

@Injectable()
export class AttendanceService {
  private readonly attendanceCodeSecret: string;
  private readonly ipRateStates = new Map<string, IpRateState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.attendanceCodeSecret = this.configService.getOrThrow<string>(
      'ATTENDANCE_CODE_SECRET',
    );
  }

  async findCurrentCode(
    courseOfferingId: string,
    classId: string,
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<AttendanceCodeMetadataResponse | null> {
    const session = await this.findSession(
      courseOfferingId,
      classId,
      sessionId,
    );

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
    courseOfferingId: string,
    classId: string,
    sessionId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<AttendanceCodeGenerationResponse> {
    const now = new Date();
    const code = randomInt(0, 10_000).toString().padStart(4, '0');

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
          class: {
            courseOfferingId,
          },
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

      if (now < session.startsAt || now >= session.endsAt) {
        throw new ConflictException(
          '출석 코드는 수업 시작 이후부터 종료 전까지만 생성할 수 있습니다.',
        );
      }

      const expiresAt = new Date(
        Math.min(now.getTime() + 10 * 60 * 1000, session.endsAt.getTime()),
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
              class: {
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
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
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
        enrollment.courseOfferingId !== session.class.courseOfferingId ||
        enrollment.studentId !== actor.id ||
        enrollmentSubject.courseOfferingSubjectId !==
          session.courseOfferingSubjectId
      ) {
        throw new ForbiddenException(
          '수강 정보와 실제 수업 과목이 일치하지 않습니다.',
        );
      }

      const attendanceStatus =
        now.getTime() <= session.startsAt.getTime() + 5 * 60 * 1000
          ? AttendanceStatus.PRESENT
          : AttendanceStatus.LATE;

      const existingRecord = await tx.attendanceRecord.findUnique({
        where: {
          classSessionId_studentId: {
            classSessionId: session.id,
            studentId: actor.id,
          },
        },
      });

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
    };
  }

  private async findSession(
    courseOfferingId: string,
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
        class: {
          courseOfferingId,
        },
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
