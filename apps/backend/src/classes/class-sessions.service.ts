import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  SessionKind,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ClassSessionRangeDto } from './dto/class-session-range.dto';

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
  ): Promise<ClassSessionResponse[]> {
    await this.assertClassExists(courseOfferingId, classId);

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

    const sessions = await this.findAll(courseOfferingId, classId, range);

    return {
      ...result,
      sessions,
    };
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

  private async assertClassExists(
    courseOfferingId: string,
    classId: string,
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
