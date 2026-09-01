import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { Prisma } from '../generated/prisma/client';
import { toSeoulDateString, todaySeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassSchedulePatternDto } from './dto/create-class-schedule-pattern.dto';
import { UpdateClassSchedulePatternDto } from './dto/update-class-schedule-pattern.dto';

export type ClassSchedulePatternResponse = {
  id: string;
  classId: string;
  classProgramId: string;
  programName: string;
  classSubjectId: string;
  subjectName: string;
  instructor: { id: string; name: string; loginId: string | null };
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  active: boolean;
};

const PATTERN_INCLUDE = {
  classSubject: {
    include: {
      courseOfferingSubject: {
        include: { subject: { select: { id: true, name: true } } },
      },
    },
  },
  classProgram: {
    include: {
      courseOffering: {
        include: {
          instructor: { select: { id: true, name: true, loginId: true } },
        },
      },
    },
  },
} as const;

type PatternWithRelations = Prisma.ClassSchedulePatternGetPayload<{
  include: typeof PATTERN_INCLUDE;
}>;

@Injectable()
export class ClassSchedulePatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(classId: string): Promise<ClassSchedulePatternResponse[]> {
    await this.assertClassExists(classId);
    const items = await this.prisma.classSchedulePattern.findMany({
      where: { classId },
      include: PATTERN_INCLUDE,
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
    return items.map((item) => this.toResponse(item));
  }

  async create(
    classId: string,
    dto: CreateClassSchedulePatternDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSchedulePatternResponse> {
    const startTime = this.toTime(dto.startTime);
    const endTime = this.toTime(dto.endTime);
    this.assertTimeOrder(startTime, endTime);

    const patternId = await this.prisma.$transaction(async (tx) => {
      const classItem = await tx.class.findUnique({ where: { id: classId } });
      if (!classItem) throw new NotFoundException('반을 찾을 수 없습니다.');
      this.assertUpcoming(classItem.startDate);

      const classSubject = await tx.classSubject.findFirst({
        where: { id: dto.classSubjectId, classId, active: true },
        include: {
          classProgram: {
            include: {
              courseOffering: { select: { name: true, instructorId: true } },
            },
          },
          courseOfferingSubject: { include: { subject: true } },
        },
      });
      if (!classSubject?.classProgram) {
        throw new ConflictException(
          '사용 중인 반 운영 과목만 시간표에 추가할 수 있습니다.',
        );
      }

      await this.assertNoOverlap(
        tx,
        classItem,
        dto.dayOfWeek,
        startTime,
        endTime,
        dto.room?.trim() || null,
      );

      const created = await tx.classSchedulePattern.create({
        data: {
          classId,
          classProgramId: classSubject.classProgram.id,
          classSubjectId: classSubject.id,
          dayOfWeek: dto.dayOfWeek,
          startTime,
          endTime,
          room: dto.room?.trim() || null,
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
            classProgramId: classSubject.classProgram.id,
            classSubjectId: classSubject.id,
            subjectName: classSubject.courseOfferingSubject.subject.name,
            dayOfWeek: dto.dayOfWeek,
            startTime: dto.startTime,
            endTime: dto.endTime,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
      return created.id;
    });

    return this.findOne(classId, patternId);
  }

  async update(
    classId: string,
    patternId: string,
    dto: UpdateClassSchedulePatternDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSchedulePatternResponse> {
    await this.prisma.$transaction(async (tx) => {
      const classItem = await tx.class.findUnique({ where: { id: classId } });
      if (!classItem) throw new NotFoundException('반을 찾을 수 없습니다.');
      this.assertUpcoming(classItem.startDate);
      const current = await tx.classSchedulePattern.findFirst({
        where: { id: patternId, classId },
      });
      if (!current) throw new NotFoundException('시간표를 찾을 수 없습니다.');

      const classSubjectId = dto.classSubjectId ?? current.classSubjectId;
      const classSubject = await tx.classSubject.findFirst({
        where: { id: classSubjectId, classId, active: true },
        include: {
          classProgram: true,
          courseOfferingSubject: { include: { subject: true } },
        },
      });
      if (!classSubject?.classProgram) {
        throw new ConflictException(
          '사용 중인 반 운영 과목만 시간표에 사용할 수 있습니다.',
        );
      }
      const classProgramId = classSubject.classProgram.id;

      const dayOfWeek = dto.dayOfWeek ?? current.dayOfWeek;
      const startTime = dto.startTime
        ? this.toTime(dto.startTime)
        : current.startTime;
      const endTime = dto.endTime ? this.toTime(dto.endTime) : current.endTime;
      this.assertTimeOrder(startTime, endTime);
      const room =
        dto.room !== undefined ? dto.room.trim() || null : current.room;

      await this.assertNoOverlap(
        tx,
        classItem,
        dayOfWeek,
        startTime,
        endTime,
        room,
        patternId,
      );

      const updated = await tx.classSchedulePattern.update({
        where: { id: patternId },
        data: {
          classProgramId,
          classSubjectId: classSubject.id,
          dayOfWeek,
          startTime,
          endTime,
          room,
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'CLASS_SCHEDULE_PATTERN_UPDATED',
          resourceType: 'CLASS_SCHEDULE_PATTERN',
          resourceId: updated.id,
          afterData: {
            classProgramId,
            classSubjectId: classSubject.id,
            subjectName: classSubject.courseOfferingSubject.subject.name,
            dayOfWeek,
            startTime: this.toTimeString(startTime),
            endTime: this.toTimeString(endTime),
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });
    return this.findOne(classId, patternId);
  }

  private async findOne(
    classId: string,
    patternId: string,
  ): Promise<ClassSchedulePatternResponse> {
    const item = await this.prisma.classSchedulePattern.findFirst({
      where: { id: patternId, classId },
      include: PATTERN_INCLUDE,
    });
    if (!item) throw new NotFoundException('시간표를 찾을 수 없습니다.');
    return this.toResponse(item);
  }

  private async assertClassExists(classId: string): Promise<void> {
    const count = await this.prisma.class.count({ where: { id: classId } });
    if (count === 0) throw new NotFoundException('반을 찾을 수 없습니다.');
  }

  private assertUpcoming(startDate: Date): void {
    if (todaySeoulDateString() >= this.toDateString(startDate)) {
      throw new ConflictException(
        '시간표는 반 운영 시작 전까지만 수정할 수 있습니다.',
      );
    }
  }

  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    classItem: {
      id: string;
      room: string | null;
      startDate: Date;
      endDate: Date;
    },
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
    room: string | null,
    excludedId?: string,
  ): Promise<void> {
    // 같은 요일·시간에 겹치는 다른 시간표를 모두 가져와 두 가지를 본다.
    // 같은 반이면 학생이 두 수업에 동시에 들어갈 수 없으므로 무조건 충돌이고,
    // 다른 반이면 강의실이 같고 운영 기간까지 겹칠 때만 충돌이다.
    const candidates = await tx.classSchedulePattern.findMany({
      where: {
        dayOfWeek,
        active: true,
        ...(excludedId ? { id: { not: excludedId } } : {}),
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            room: true,
            startDate: true,
            endDate: true,
            archivedAt: true,
          },
        },
      },
    });

    const sameClass = candidates.find(
      (candidate) => candidate.classId === classItem.id,
    );
    if (sameClass) {
      throw new ConflictException(
        '같은 요일에 시간이 겹치는 시간표가 있습니다.',
      );
    }

    const effectiveRoom = room ?? classItem.room;
    if (!effectiveRoom) {
      return;
    }

    const roomConflict = candidates.find((candidate) => {
      if (candidate.class.archivedAt) {
        return false;
      }

      const candidateRoom = candidate.room ?? candidate.class.room;
      if (candidateRoom !== effectiveRoom) {
        return false;
      }

      // 운영 기간이 겹치지 않으면 같은 강의실을 써도 된다.
      return (
        candidate.class.startDate <= classItem.endDate &&
        candidate.class.endDate >= classItem.startDate
      );
    });

    if (roomConflict) {
      throw new ConflictException(
        `같은 시간에 ${effectiveRoom} 강의실을 사용하는 반이 있습니다: ${roomConflict.class.name}`,
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

  private toDateString(value: Date): string {
    return toSeoulDateString(value);
  }

  private toResponse(item: PatternWithRelations): ClassSchedulePatternResponse {
    if (!item.classProgram) {
      throw new ConflictException('시간표의 교육과정 연결이 없습니다.');
    }
    return {
      id: item.id,
      classId: item.classId,
      classProgramId: item.classProgram.id,
      programName: item.classProgram.courseOffering.name,
      classSubjectId: item.classSubject.id,
      subjectName: item.classSubject.courseOfferingSubject.subject.name,
      instructor: item.classProgram.courseOffering.instructor,
      dayOfWeek: item.dayOfWeek,
      startTime: this.toTimeString(item.startTime),
      endTime: this.toTimeString(item.endTime),
      room: item.room,
      active: item.active,
    };
  }
}
