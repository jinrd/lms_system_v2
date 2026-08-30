import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  ClassStatus,
  EnrollmentStatus,
  EnrollmentType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRegularEnrollmentDto } from './dto/create-regular-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';

export type EnrollmentResponse = {
  id: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingId: string;
  classId: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  startsOn: string;
  endsOn: string | null;
  reason: string | null;
  attendanceManaged: boolean;
  gradeManaged: boolean;
  subjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    subjectId: string;
    subjectName: string;
    startsOn: string;
    endsOn: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentPageResponse = {
  items: EnrollmentResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const ENROLLMENT_INCLUDE = {
  student: {
    select: {
      id: true,
      loginId: true,
      name: true,
      phone: true,
    },
  },
  subjects: {
    include: {
      courseOfferingSubject: {
        include: {
          subject: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  },
} as const;

type EnrollmentWithRelations = {
  id: string;
  courseOfferingId: string;
  classId: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  startsOn: Date;
  endsOn: Date | null;
  reason: string | null;
  attendanceManaged: boolean;
  gradeManaged: boolean;
  createdAt: Date;
  updatedAt: Date;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  subjects: Array<{
    id: string;
    courseOfferingSubjectId: string;
    startsOn: Date;
    endsOn: Date | null;
    courseOfferingSubject: {
      sequence: number;
      subject: {
        id: string;
        name: string;
      };
    };
  }>;
};

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    courseOfferingId: string,
    classId: string,
    query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    await this.assertClassExists(courseOfferingId, classId);

    const keyword = query.keyword?.trim();
    const where = {
      courseOfferingId,
      classId,
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            student: {
              OR: [
                {
                  name: {
                    contains: keyword,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  loginId: {
                    contains: keyword,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  phone: {
                    contains: keyword,
                  },
                },
              ],
            },
          }
        : {}),
    };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        include: ENROLLMENT_INCLUDE,
        orderBy: [{ startsOn: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toResponse(item)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async createRegular(
    courseOfferingId: string,
    classId: string,
    dto: CreateRegularEnrollmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EnrollmentResponse> {
    const startsOn = this.toDate(dto.startsOn);
    const endsOn = dto.endsOn ? this.toDate(dto.endsOn) : null;
    const reason = this.optionalText(dto.reason);

    if (endsOn && startsOn > endsOn) {
      throw new BadRequestException(
        '수강 종료일은 시작일보다 빠를 수 없습니다.',
      );
    }

    const enrollmentId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM course_offerings
        WHERE id = ${courseOfferingId}::uuid
        FOR UPDATE
      `;

      const classItem = await tx.class.findFirst({
        where: {
          id: classId,
          courseOfferingId,
        },
        include: {
          classSubjects: {
            select: {
              courseOfferingSubjectId: true,
            },
          },
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
          '완료되거나 취소된 반에는 학생을 배정할 수 없습니다.',
        );
      }

      if (
        startsOn > classItem.endDate ||
        (endsOn && endsOn < classItem.startDate)
      ) {
        throw new BadRequestException(
          '수강 기간은 반 운영 기간과 겹쳐야 합니다.',
        );
      }

      const student = await tx.user.findUnique({
        where: {
          id: dto.studentId,
        },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      if (!student || student.role !== UserRole.STUDENT) {
        throw new NotFoundException('학생 계정을 찾을 수 없습니다.');
      }

      if (student.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 학생만 수강 등록할 수 있습니다.',
        );
      }

      const duplicate = await tx.enrollment.findFirst({
        where: {
          studentId: student.id,
          courseOfferingId,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new ConflictException(
          '이 학생은 해당 개설 강의에 이미 기본 수강 등록되어 있습니다.',
        );
      }

      const currentEnrollmentCount = await tx.enrollment.count({
        where: {
          classId,
          type: EnrollmentType.REGULAR,
          status: {
            in: [EnrollmentStatus.SCHEDULED, EnrollmentStatus.ACTIVE],
          },
        },
      });

      if (currentEnrollmentCount >= classItem.capacity) {
        throw new ConflictException('반 정원을 초과할 수 없습니다.');
      }

      if (classItem.classSubjects.length === 0) {
        throw new ConflictException(
          '운영 과목이 없는 반에는 학생을 배정할 수 없습니다.',
        );
      }

      const status = this.getInitialStatus(startsOn, endsOn);

      const enrollment = await tx.enrollment.create({
        data: {
          studentId: student.id,
          courseOfferingId,
          classId,
          type: EnrollmentType.REGULAR,
          status,
          startsOn,
          endsOn,
          reason,
          attendanceManaged: true,
          gradeManaged: true,
          assignedById: actor.id,
        },
      });

      await tx.enrollmentSubject.createMany({
        data: classItem.classSubjects.map((subject) => ({
          enrollmentId: enrollment.id,
          courseOfferingId,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          startsOn,
          endsOn,
          attendanceManaged: true,
          gradeManaged: true,
          reason,
        })),
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'REGULAR_ENROLLMENT_CREATED',
          resourceType: 'ENROLLMENT',
          resourceId: enrollment.id,
          afterData: {
            studentId: student.id,
            courseOfferingId,
            classId,
            type: EnrollmentType.REGULAR,
            status,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn ?? null,
            subjectCount: classItem.classSubjects.length,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return enrollment.id;
    });

    return this.findOne(courseOfferingId, classId, enrollmentId);
  }

  private async findOne(
    courseOfferingId: string,
    classId: string,
    enrollmentId: string,
  ): Promise<EnrollmentResponse> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        id: enrollmentId,
        courseOfferingId,
        classId,
      },
      include: ENROLLMENT_INCLUDE,
    });

    if (!enrollment) {
      throw new NotFoundException('수강 등록을 찾을 수 없습니다.');
    }

    return this.toResponse(enrollment);
  }

  private async assertClassExists(
    courseOfferingId: string,
    classId: string,
  ): Promise<void> {
    const exists = await this.prisma.class.findFirst({
      where: {
        id: classId,
        courseOfferingId,
      },
      select: {
        id: true,
      },
    });

    if (!exists) {
      throw new NotFoundException('반을 찾을 수 없습니다.');
    }
  }

  private getInitialStatus(
    startsOn: Date,
    endsOn: Date | null,
  ): EnrollmentStatus {
    const today = this.toDate(
      new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Seoul',
      }),
    );

    if (endsOn && endsOn < today) {
      throw new BadRequestException(
        '이미 종료된 기간으로 신규 수강 등록할 수 없습니다.',
      );
    }

    return startsOn > today
      ? EnrollmentStatus.SCHEDULED
      : EnrollmentStatus.ACTIVE;
  }

  private toDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('올바른 날짜를 입력해야 합니다.');
    }

    return date;
  }

  private optionalText(value?: string): string | null {
    const normalized = value?.trim();

    return normalized ? normalized : null;
  }

  private toResponse(item: EnrollmentWithRelations): EnrollmentResponse {
    return {
      id: item.id,
      student: item.student,
      courseOfferingId: item.courseOfferingId,
      classId: item.classId,
      type: item.type,
      status: item.status,
      startsOn: item.startsOn.toISOString().slice(0, 10),
      endsOn: item.endsOn?.toISOString().slice(0, 10) ?? null,
      reason: item.reason,
      attendanceManaged: item.attendanceManaged,
      gradeManaged: item.gradeManaged,
      subjects: [...item.subjects]
        .sort(
          (left, right) =>
            left.courseOfferingSubject.sequence -
            right.courseOfferingSubject.sequence,
        )
        .map((subject) => ({
          id: subject.id,
          courseOfferingSubjectId: subject.courseOfferingSubjectId,
          subjectId: subject.courseOfferingSubject.subject.id,
          subjectName: subject.courseOfferingSubject.subject.name,
          startsOn: subject.startsOn.toISOString().slice(0, 10),
          endsOn: subject.endsOn?.toISOString().slice(0, 10) ?? null,
        })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
