import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ClassStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AddClassSubjectDto } from './dto/add-class-subject.dto';

export type ClassSubjectResponse = {
  id: string;
  classId: string;
  courseOfferingId: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  educationFieldId: string;
  educationFieldName: string;
  sequence: number;
  createdAt: string;
};

const CLASS_SUBJECT_INCLUDE = {
  courseOfferingSubject: {
    include: {
      subject: {
        include: {
          educationField: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class ClassSubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
  ): Promise<ClassSubjectResponse[]> {
    await this.assertClassExists(courseOfferingId, classId);

    const subjects = await this.prisma.classSubject.findMany({
      where: {
        classId,
        courseOfferingId,
      },
      include: CLASS_SUBJECT_INCLUDE,
      orderBy: {
        courseOfferingSubject: {
          sequence: 'asc',
        },
      },
    });

    return subjects.map((subject) => this.toResponse(subject));
  }

  async add(
    courseOfferingId: string,
    classId: string,
    dto: AddClassSubjectDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ClassSubjectResponse> {
    try {
      const subject = await this.prisma.$transaction(async (tx) => {
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
            '완료되거나 취소된 반에는 운영 과목을 추가할 수 없습니다.',
          );
        }

        const courseOfferingSubject = await tx.courseOfferingSubject.findFirst({
          where: {
            id: dto.courseOfferingSubjectId,
            courseOfferingId,
          },
          include: {
            subject: {
              include: {
                educationField: true,
              },
            },
          },
        });

        if (!courseOfferingSubject) {
          throw new NotFoundException(
            '개설 강의에 연결된 과목을 찾을 수 없습니다.',
          );
        }

        const created = await tx.classSubject.create({
          data: {
            classId,
            courseOfferingId,
            courseOfferingSubjectId: courseOfferingSubject.id,
          },
          include: CLASS_SUBJECT_INCLUDE,
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'CLASS_SUBJECT_ADDED',
            resourceType: 'CLASS_SUBJECT',
            resourceId: created.id,
            afterData: {
              classId,
              courseOfferingId,
              courseOfferingSubjectId: courseOfferingSubject.id,
              subjectId: courseOfferingSubject.subjectId,
              subjectName: courseOfferingSubject.subject.name,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(subject);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('이미 반에 추가된 운영 과목입니다.');
      }

      throw error;
    }
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

  private toResponse(subject: {
    id: string;
    classId: string;
    courseOfferingId: string;
    courseOfferingSubjectId: string;
    createdAt: Date;
    courseOfferingSubject: {
      sequence: number;
      subject: {
        id: string;
        name: string;
        educationFieldId: string;
        educationField: {
          name: string;
        };
      };
    };
  }): ClassSubjectResponse {
    return {
      id: subject.id,
      classId: subject.classId,
      courseOfferingId: subject.courseOfferingId,
      courseOfferingSubjectId: subject.courseOfferingSubjectId,
      subjectId: subject.courseOfferingSubject.subject.id,
      subjectName: subject.courseOfferingSubject.subject.name,
      educationFieldId: subject.courseOfferingSubject.subject.educationFieldId,
      educationFieldName:
        subject.courseOfferingSubject.subject.educationField.name,
      sequence: subject.courseOfferingSubject.sequence,
      createdAt: subject.createdAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
