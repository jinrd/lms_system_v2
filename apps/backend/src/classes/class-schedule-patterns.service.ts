import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ClassStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassSchedulePatternDto } from './dto/create-class-schedule-pattern.dto';
import { UpdateClassSchedulePatternDto } from './dto/update-class-schedule-pattern.dto';

export type ClassSchedulePatternResponse = {
  id: string;
  classId: string;
  classSubjectId: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const PATTERN_INCLUDE = {
  classSubject: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class ClassSchedulePatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
  ): Promise<ClassSchedulePatternResponse[]> {
    await this.assertClassExists(courseOfferingId, classId);

    const patterns = await this.prisma.classSchedulePattern.findMany({
      where: {
        classId,
      },
      include: PATTERN_INCLUDE,
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return patterns.map((pattern) => this.toResponse(pattern));
  }

  async create(
    courseOfferingId: string,
    classId: string,
    dto: CreateClassSchedulePatternDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSchedulePatternResponse> {
    const startTime = this.toTime(dto.startTime);
    const endTime = this.toTime(dto.endTime);

    this.assertTimeOrder(startTime, endTime);

    const patternId = await this.prisma.$transaction(async (tx) => {
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

      this.assertClassEditable(classItem.status);

      const classSubject = await tx.classSubject.findFirst({
        where: {
          id: dto.classSubjectId,
          classId,
          courseOfferingId,
        },
      });

      if (!classSubject) {
        throw new NotFoundException(
          '해당 반에 연결된 과목을 찾을 수 없습니다.',
        );
      }

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${classId}:${dto.dayOfWeek}`})
        )
      `;

      const overlapping = await tx.classSchedulePattern.findFirst({
        where: {
          classId,
          dayOfWeek: dto.dayOfWeek,
          active: true,
          startTime: {
            lt: endTime,
          },
          endTime: {
            gt: startTime,
          },
        },
        select: {
          id: true,
        },
      });

      if (overlapping) {
        throw new ConflictException(
          '같은 요일에 시간이 겹치는 시간표가 존재합니다.',
        );
      }

      const created = await tx.classSchedulePattern.create({
        data: {
          classId,
          classSubjectId: dto.classSubjectId,
          dayOfWeek: dto.dayOfWeek,
          startTime,
          endTime,
          room: this.optionalText(dto.room),
          active: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SCHEDULE_PATTERN_CREATED',
          resourceType: 'CLASS_SCHEDULE_PATTERN',
          resourceId: created.id,
          afterData: {
            classId,
            classSubjectId: dto.classSubjectId,
            dayOfWeek: dto.dayOfWeek,
            startTime: dto.startTime,
            endTime: dto.endTime,
            room: this.optionalText(dto.room),
            active: true,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created.id;
    });

    return this.findOne(courseOfferingId, classId, patternId);
  }

  async update(
    courseOfferingId: string,
    classId: string,
    patternId: string,
    dto: UpdateClassSchedulePatternDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSchedulePatternResponse> {
    await this.prisma.$transaction(async (tx) => {
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

      this.assertClassEditable(classItem.status);

      const current = await tx.classSchedulePattern.findFirst({
        where: {
          id: patternId,
          classId,
        },
      });

      if (!current) {
        throw new NotFoundException('반복 시간표를 찾을 수 없습니다.');
      }

      const classSubjectId = dto.classSubjectId ?? current.classSubjectId;
      const dayOfWeek = dto.dayOfWeek ?? current.dayOfWeek;
      const startTime = dto.startTime
        ? this.toTime(dto.startTime)
        : current.startTime;
      const endTime = dto.endTime ? this.toTime(dto.endTime) : current.endTime;
      const active = dto.active ?? current.active;

      this.assertTimeOrder(startTime, endTime);

      const classSubject = await tx.classSubject.findFirst({
        where: {
          id: classSubjectId,
          classId,
          courseOfferingId,
        },
      });

      if (!classSubject) {
        throw new NotFoundException(
          '해당 반에 연결된 과목을 찾을 수 없습니다.',
        );
      }

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${`${classId}:${dayOfWeek}`})
        )
      `;

      if (active) {
        const overlapping = await tx.classSchedulePattern.findFirst({
          where: {
            id: {
              not: patternId,
            },
            classId,
            dayOfWeek,
            active: true,
            startTime: {
              lt: endTime,
            },
            endTime: {
              gt: startTime,
            },
          },
          select: {
            id: true,
          },
        });

        if (overlapping) {
          throw new ConflictException(
            '같은 요일에 시간이 겹치는 시간표가 존재합니다.',
          );
        }
      }

      const room =
        dto.room === undefined ? current.room : this.optionalText(dto.room);

      await tx.classSchedulePattern.update({
        where: {
          id: patternId,
        },
        data: {
          classSubjectId,
          dayOfWeek,
          startTime,
          endTime,
          room,
          active,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SCHEDULE_PATTERN_UPDATED',
          resourceType: 'CLASS_SCHEDULE_PATTERN',
          resourceId: patternId,
          beforeData: {
            classSubjectId: current.classSubjectId,
            dayOfWeek: current.dayOfWeek,
            startTime: this.toTimeString(current.startTime),
            endTime: this.toTimeString(current.endTime),
            room: current.room,
            active: current.active,
          },
          afterData: {
            classSubjectId,
            dayOfWeek,
            startTime: this.toTimeString(startTime),
            endTime: this.toTimeString(endTime),
            room,
            active,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.findOne(courseOfferingId, classId, patternId);
  }

  private async findOne(
    courseOfferingId: string,
    classId: string,
    patternId: string,
  ): Promise<ClassSchedulePatternResponse> {
    const pattern = await this.prisma.classSchedulePattern.findFirst({
      where: {
        id: patternId,
        classId,
        class: {
          courseOfferingId,
        },
      },
      include: PATTERN_INCLUDE,
    });

    if (!pattern) {
      throw new NotFoundException('반복 시간표를 찾을 수 없습니다.');
    }

    return this.toResponse(pattern);
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

  private assertClassEditable(status: ClassStatus): void {
    if (status === ClassStatus.COMPLETED || status === ClassStatus.CANCELED) {
      throw new ConflictException(
        '완료되거나 취소된 반의 시간표는 변경할 수 없습니다.',
      );
    }
  }

  private assertTimeOrder(startTime: Date, endTime: Date): void {
    if (startTime >= endTime) {
      throw new BadRequestException('종료 시간은 시작 시간보다 늦어야 합니다.');
    }
  }

  private toTime(value: string): Date {
    return new Date(`1970-01-01T${value}:00.000Z`);
  }

  private toTimeString(value: Date): string {
    return value.toISOString().slice(11, 16);
  }

  private optionalText(value?: string): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  private toResponse(pattern: {
    id: string;
    classId: string;
    classSubjectId: string;
    dayOfWeek: number;
    startTime: Date;
    endTime: Date;
    room: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    classSubject: {
      courseOfferingSubjectId: string;
      courseOfferingSubject: {
        subject: {
          id: string;
          name: string;
        };
      };
    };
  }): ClassSchedulePatternResponse {
    return {
      id: pattern.id,
      classId: pattern.classId,
      classSubjectId: pattern.classSubjectId,
      courseOfferingSubjectId: pattern.classSubject.courseOfferingSubjectId,
      subjectId: pattern.classSubject.courseOfferingSubject.subject.id,
      subjectName: pattern.classSubject.courseOfferingSubject.subject.name,
      dayOfWeek: pattern.dayOfWeek,
      startTime: this.toTimeString(pattern.startTime),
      endTime: this.toTimeString(pattern.endTime),
      room: pattern.room,
      active: pattern.active,
      createdAt: pattern.createdAt.toISOString(),
      updatedAt: pattern.updatedAt.toISOString(),
    };
  }
}
