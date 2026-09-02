import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { todaySeoulDateOnly } from '../common/seoul-date';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 문제은행·시험 템플릿의 강사 접근 범위(결정 D-Q1)를 판정한다.
 *
 * 강사는 본인이 현재 담당 중인(`class_instructor_assignments` 활성) 반의 활성
 * `class_subjects`에 연결된 세부 과목의 문제·템플릿만 다룬다. 예외로, 본인이
 * 작성한 문제·템플릿은 담당 반이 바뀌어도 계속 조회·수정할 수 있다. 실장·원장·
 * 관리자는 전체 범위다.
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
   * 강사가 현재 담당 중인 반을 통해 접근할 수 있는 세부 과목 식별자 집합이다.
   *
   * 담당 배정은 오늘(Asia/Seoul)이 `assigned_from` 이후이고 `assigned_to`가
   * 없거나 오늘 이후인 것만 활성으로 본다.
   */
  async getAccessibleSubjectIds(instructorId: string): Promise<string[]> {
    const today = todaySeoulDateOnly();

    const rows = await this.prisma.classSubject.findMany({
      where: {
        active: true,
        class: {
          instructorAssignments: {
            some: {
              instructorId,
              assignedFrom: { lte: today },
              OR: [{ assignedTo: null }, { assignedTo: { gte: today } }],
            },
          },
        },
      },
      select: {
        courseOfferingSubject: { select: { subjectId: true } },
      },
    });

    return [...new Set(rows.map((row) => row.courseOfferingSubject.subjectId))];
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
