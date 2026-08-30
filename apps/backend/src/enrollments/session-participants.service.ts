import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  EnrollmentStatus,
  EnrollmentType,
  SessionStatus,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AssignSessionParticipantDto } from './dto/assign-session-participant.dto';

export type SessionParticipantResponse = {
  id: string;
  classSessionId: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingSubjectId: string;
  sourceEnrollmentId: string;
  sourceEnrollmentSubjectId: string;
  type: EnrollmentType;
  reason: string;
  assignedBy: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
};

const PARTICIPANT_INCLUDE = {
  student: {
    select: {
      id: true,
      loginId: true,
      name: true,
      phone: true,
    },
  },
  assignedBy: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

type ParticipantWithRelations = {
  id: string;
  classSessionId: string;
  courseOfferingSubjectId: string;
  sourceEnrollmentId: string;
  sourceEnrollmentSubjectId: string;
  type: EnrollmentType;
  reason: string;
  createdAt: Date;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  assignedBy: {
    id: string;
    name: string;
  } | null;
};

@Injectable()
export class SessionParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
    sessionId: string,
  ): Promise<SessionParticipantResponse[]> {
    await this.assertSessionExists(courseOfferingId, classId, sessionId);

    const participants = await this.prisma.sessionParticipant.findMany({
      where: {
        classSessionId: sessionId,
      },
      include: PARTICIPANT_INCLUDE,
      orderBy: {
        createdAt: 'asc',
      },
    });

    return participants.map((participant) => this.toResponse(participant));
  }

  async assign(
    courseOfferingId: string,
    classId: string,
    sessionId: string,
    dto: AssignSessionParticipantDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<SessionParticipantResponse> {
    const reason = dto.reason.trim();

    const participantId = await this.prisma.$transaction(async (tx) => {
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
        select: {
          id: true,
          classId: true,
          courseOfferingSubjectId: true,
          startsAt: true,
          status: true,
        },
      });

      if (!session) {
        throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
      }

      if (session.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException(
          '예정 상태의 실제 수업에만 참여자를 배정할 수 있습니다.',
        );
      }

      const sessionDate = this.toSeoulDate(session.startsAt);

      const sourceEnrollment = await tx.enrollment.findFirst({
        where: {
          id: dto.sourceEnrollmentId,
          courseOfferingId,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
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
        include: {
          student: {
            select: {
              id: true,
              status: true,
            },
          },
          subjects: {
            where: {
              courseOfferingSubjectId: session.courseOfferingSubjectId,
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
            select: {
              id: true,
              courseOfferingSubjectId: true,
            },
          },
        },
      });

      if (!sourceEnrollment) {
        throw new NotFoundException(
          '수업일에 유효한 기존 수강 등록을 찾을 수 없습니다.',
        );
      }

      if (sourceEnrollment.student.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 학생만 실제 수업에 참여할 수 있습니다.',
        );
      }

      const sourceEnrollmentSubject = sourceEnrollment.subjects[0];

      if (!sourceEnrollmentSubject) {
        throw new ConflictException(
          '학생의 기존 수강에 해당 수업 과목이 포함되어 있지 않습니다.',
        );
      }

      const normalParticipation = await tx.enrollment.findFirst({
        where: {
          studentId: sourceEnrollment.studentId,
          classId,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
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
        select: {
          id: true,
        },
      });

      if (normalParticipation) {
        throw new ConflictException(
          '이미 해당 수업의 정상 참여 대상인 학생입니다.',
        );
      }

      const duplicate = await tx.sessionParticipant.findUnique({
        where: {
          classSessionId_studentId: {
            classSessionId: session.id,
            studentId: sourceEnrollment.studentId,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new ConflictException('이미 해당 실제 수업에 배정된 학생입니다.');
      }

      const participant = await tx.sessionParticipant.create({
        data: {
          classSessionId: session.id,
          studentId: sourceEnrollment.studentId,
          courseOfferingSubjectId: session.courseOfferingSubjectId,
          sourceEnrollmentId: sourceEnrollment.id,
          sourceEnrollmentSubjectId: sourceEnrollmentSubject.id,
          type: dto.type,
          reason,
          assignedById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'SESSION_PARTICIPANT_ASSIGNED',
          resourceType: 'SESSION_PARTICIPANT',
          resourceId: participant.id,
          afterData: {
            classSessionId: session.id,
            studentId: sourceEnrollment.studentId,
            sourceEnrollmentId: sourceEnrollment.id,
            sourceEnrollmentSubjectId: sourceEnrollmentSubject.id,
            courseOfferingSubjectId: session.courseOfferingSubjectId,
            type: dto.type,
            reason,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return participant.id;
    });

    return this.findOne(participantId);
  }

  private async findOne(
    participantId: string,
  ): Promise<SessionParticipantResponse> {
    const participant = await this.prisma.sessionParticipant.findUnique({
      where: {
        id: participantId,
      },
      include: PARTICIPANT_INCLUDE,
    });

    if (!participant) {
      throw new NotFoundException('실제 수업 참여자를 찾을 수 없습니다.');
    }

    return this.toResponse(participant);
  }

  private async assertSessionExists(
    courseOfferingId: string,
    classId: string,
    sessionId: string,
  ): Promise<void> {
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
      },
    });

    if (!session) {
      throw new NotFoundException('실제 수업을 찾을 수 없습니다.');
    }
  }

  private toSeoulDate(value: Date): Date {
    const dateString = value.toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Seoul',
    });

    return new Date(`${dateString}T00:00:00.000Z`);
  }

  private toResponse(
    participant: ParticipantWithRelations,
  ): SessionParticipantResponse {
    return {
      id: participant.id,
      classSessionId: participant.classSessionId,
      student: participant.student,
      courseOfferingSubjectId: participant.courseOfferingSubjectId,
      sourceEnrollmentId: participant.sourceEnrollmentId,
      sourceEnrollmentSubjectId: participant.sourceEnrollmentSubjectId,
      type: participant.type,
      reason: participant.reason,
      assignedBy: participant.assignedBy,
      createdAt: participant.createdAt.toISOString(),
    };
  }
}
