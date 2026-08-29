import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  SessionKind,
  SessionStatus,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeClassSessionStatusDto } from './dto/change-class-session-status.dto';
import { ClassSessionRangeDto } from './dto/class-session-range.dto';
import { UpdateClassSessionDto } from './dto/update-class-session.dto';

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
  createdAt: string;
  updatedAt: string;
};

export type ClassSessionGenerationResponse = {
  createdCount: number;
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
} as const;

@Injectable()
export class ClassSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
    range: ClassSessionRangeDto,
    actor: AuthenticatedUser,
  ): Promise<ClassSessionResponse[]> {
    await this.assertClassAccess(courseOfferingId, classId, actor);

    const { rangeStart, rangeEndExclusive } = this.validateRange(range);

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
    courseOfferingId: string,
    classId: string,
    range: ClassSessionRangeDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSessionGenerationResponse> {
    const { startDate, endDate, rangeStart, rangeEndExclusive } =
      this.validateRange(range);

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
          courseOfferingId,
        },
      });

      if (!classItem) {
        throw new NotFoundException('반을 찾을 수 없습니다.');
      }

      if (
        classItem.status === ClassStatus.COMPLETED ||
        classItem.status === ClassStatus.CANCELED
      ) {
        throw new ConflictException(
          '완료되거나 취소된 반에는 수업을 생성할 수 없습니다.',
        );
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

      const assignments = await tx.classInstructorAssignment.findMany({
        where: {
          classId,
          assignedFrom: {
            lte: endDate,
          },
          OR: [
            {
              assignedTo: null,
            },
            {
              assignedTo: {
                gte: startDate,
              },
            },
          ],
        },
        orderBy: {
          assignedFrom: 'asc',
        },
      });

      if (assignments.length === 0) {
        throw new ConflictException('생성 기간에 배정된 담당 강사가 없습니다.');
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
          schedulePatternId: true,
          startsAt: true,
        },
      });

      const existingKeys = new Set(
        existingSessions.map(
          (session) =>
            `${session.schedulePatternId}:${session.startsAt.toISOString()}`,
        ),
      );

      const candidates: Array<{
        classId: string;
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

      let skippedCount = 0;

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

        const assignment = assignments.find(
          (item) =>
            this.toDateString(item.assignedFrom) <= dateString &&
            (item.assignedTo === null ||
              this.toDateString(item.assignedTo) >= dateString),
        );

        if (!assignment) {
          throw new ConflictException(
            `${dateString}에 배정된 담당 강사가 없습니다.`,
          );
        }

        for (const pattern of dayPatterns) {
          const startTime = this.toTimeString(pattern.startTime);
          const endTime = this.toTimeString(pattern.endTime);

          const startsAt = new Date(`${dateString}T${startTime}:00+09:00`);
          const endsAt = new Date(`${dateString}T${endTime}:00+09:00`);

          const key = `${pattern.id}:${startsAt.toISOString()}`;

          if (existingKeys.has(key)) {
            skippedCount += 1;
            continue;
          }

          candidates.push({
            classId,
            classSubjectId: pattern.classSubjectId,
            courseOfferingSubjectId:
              pattern.classSubject.courseOfferingSubjectId,
            schedulePatternId: pattern.id,
            instructorId: assignment.instructorId,
            kind: SessionKind.REGULAR,
            title: `${pattern.classSubject.courseOfferingSubject.subject.name} 수업`,
            startsAt,
            endsAt,
            room: pattern.room ?? classItem.room,
            status: SessionStatus.SCHEDULED,
            createdById: actor.id,
          });

          existingKeys.add(key);
        }
      }

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
            skippedCount,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        createdCount: candidates.length,
        skippedCount,
      };
    });

    const sessions = await this.findAll(
      courseOfferingId,
      classId,
      range,
      actor,
    );

    return {
      ...result,
      sessions,
    };
  }

  async update(
    courseOfferingId: string,
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
          class: { courseOfferingId },
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

    return this.findOne(courseOfferingId, classId, sessionId);
  }

  async changeStatus(
    courseOfferingId: string,
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
          class: { courseOfferingId },
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

      const completedMinutes =
        dto.status === SessionStatus.COMPLETED
          ? (dto.completedMinutes ?? null)
          : null;

      await tx.classSession.update({
        where: { id: current.id },
        data: {
          status: dto.status,
          completedMinutes,
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

    return this.findOne(courseOfferingId, classId, sessionId);
  }

  private async findOne(
    courseOfferingId: string,
    classId: string,
    sessionId: string,
  ): Promise<ClassSessionResponse> {
    const session = await this.prisma.classSession.findFirst({
      where: {
        id: sessionId,
        classId,
        class: { courseOfferingId },
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
    courseOfferingId: string,
    classId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const classItem = await this.prisma.class.findFirst({
      where: {
        id: classId,
        courseOfferingId,
      },
      select: {
        id: true,
      },
    });

    if (!classItem) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }

    if (actor.role === UserRole.INSTRUCTOR) {
      const assignmentCount = await this.prisma.classInstructorAssignment.count(
        {
          where: {
            classId,
            instructorId: actor.id,
          },
        },
      );

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
    const seoulOffsetMilliseconds = 9 * 60 * 60 * 1000;

    return new Date(date.getTime() + seoulOffsetMilliseconds)
      .toISOString()
      .slice(0, 10);
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
    return date.toISOString().slice(0, 10);
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
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
