import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 문제은행·시험 템플릿의 강사 접근 범위(결정 D-Q1)를 판정한다.
 *
 * 담당 강사는 반이 아니라 교육과정에 배정된다(기획안 2026-09-01 개편,
 * Part III D-03·D-19·D-21). 따라서 강사는 본인이 담당하는 보관되지 않은
 * 교육과정(`course_offerings.instructor_id`)에 포함된 세부 과목의 문제·템플릿을
 * 다룬다. 예외로, 본인이 작성한 문제·템플릿은 담당 교육과정이 바뀌어도 계속
 * 조회·수정할 수 있다. 실장·원장·관리자는 전체 범위다.
 *
 * `class_instructor_assignments`는 과거 이력 보존용 레거시 테이블이라 새 행이
 * 기록되지 않으므로 접근 판정에 쓰지 않는다.
 */
@Injectable()
export class QuestionAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** 실장·원장·관리자는 범위 제한이 없다. */
  isPrivileged(role: UserRole): boolean {
    return (
      role === UserRole.MANAGER ||
      role === UserRole.PRINCIPAL ||
      role === UserRole.ADMIN
    );
  }

  /**
   * 강사가 담당하는 교육과정을 통해 접근할 수 있는 세부 과목 식별자 집합이다.
   *
   * 보관되지 않은(`archived_at IS NULL`) 교육과정 중 담당 강사가 본인인 것의
   * 과목만 본다.
   */
  async getAccessibleSubjectIds(instructorId: string): Promise<string[]> {
    const rows = await this.prisma.courseOfferingSubject.findMany({
      where: {
        courseOffering: {
          instructorId,
          archivedAt: null,
        },
      },
      select: { subjectId: true },
    });

    return [...new Set(rows.map((row) => row.subjectId))];
  }

  /**
   * 강사가 특정 과목에 문제를 새로 작성할 수 있는지 확인한다.
   *
   * 담당 범위 밖이면 `false`다. 실장 이상은 항상 `true`다.
   */
  async canWriteSubject(
    actor: AuthenticatedUser,
    subjectId: string,
  ): Promise<boolean> {
    if (this.isPrivileged(actor.role)) {
      return true;
    }

    const subjectIds = await this.getAccessibleSubjectIds(actor.id);

    return subjectIds.includes(subjectId);
  }

  /**
   * 강사가 이미 존재하는 문제(또는 템플릿)를 조회·수정할 수 있는지 확인한다.
   *
   * 대상의 과목이 담당 범위에 있거나, 본인이 작성한 것이면 허용한다.
   */
  async canAccessResource(
    actor: AuthenticatedUser,
    resource: { subjectId: string; createdById: string | null },
  ): Promise<boolean> {
    if (this.isPrivileged(actor.role)) {
      return true;
    }

    if (resource.createdById === actor.id) {
      return true;
    }

    const subjectIds = await this.getAccessibleSubjectIds(actor.id);

    return subjectIds.includes(resource.subjectId);
  }
}
