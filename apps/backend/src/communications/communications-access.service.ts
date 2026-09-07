import { Injectable } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 공지·문의의 권한 판정에 공통으로 쓰는 조회다.
 *
 * 개편 이후 강사는 반이 아니라 교육과정에 배정되므로, 강사의 "담당 반"은
 * `class_programs`를 통해 본인이 담당하는 교육과정에 연결된 반이다
 * (`instructor-classes.service`와 같은 규칙).
 */
@Injectable()
export class CommunicationsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 실장·원장·관리자는 범위 제한이 없다. */
  isPrivileged(role: UserRole): boolean {
    return (
      role === UserRole.MANAGER ||
      role === UserRole.PRINCIPAL ||
      role === UserRole.ADMIN
    );
  }

  /** 강사가 담당하는(보관되지 않은) 반 식별자 집합이다. */
  async getInstructorClassIds(instructorId: string): Promise<Set<string>> {
    const rows = await this.prisma.class.findMany({
      where: {
        archivedAt: null,
        programs: { some: { courseOffering: { instructorId } } },
      },
      select: { id: true },
    });

    return new Set(rows.map((row) => row.id));
  }

  /** 학생이 활성 수강 중인 반 식별자 집합이다. */
  async getStudentClassIds(studentId: string): Promise<Set<string>> {
    const rows = await this.prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { classId: true },
    });

    return new Set(rows.map((row) => row.classId));
  }
}
