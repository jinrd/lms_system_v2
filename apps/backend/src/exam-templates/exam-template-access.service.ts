import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { QuestionAccessService } from '../questions/question-access.service';

/**
 * 시험 템플릿의 강사 접근 범위(결정 D-Q1)를 판정한다.
 *
 * 문제은행과 규칙은 같지만 판정 기준 집합이 다르다. 템플릿은
 * `exam_template_subjects`의 과목 전체를 강사가 담당하고 있을 때만 접근할 수
 * 있다. 하나라도 담당 범위 밖이면 접근 불가다. 본인이 만든 템플릿은 담당 반이
 * 바뀌어도 계속 다룰 수 있고, 실장·원장·관리자는 전체 범위다.
 */
@Injectable()
export class ExamTemplateAccessService {
  constructor(private readonly questionAccess: QuestionAccessService) {}

  isPrivileged(role: UserRole): boolean {
    return this.questionAccess.isPrivileged(role);
  }

  /** 강사가 현재 담당 중인 반을 통해 접근할 수 있는 세부 과목 식별자 집합이다. */
  getAccessibleSubjectIds(instructorId: string): Promise<string[]> {
    return this.questionAccess.getAccessibleSubjectIds(instructorId);
  }

  /**
   * 강사가 주어진 과목 전체를 담당하는지 확인한다.
   *
   * 새 템플릿을 만들거나 템플릿의 과목 구성을 바꿀 때, 대상 과목이 모두 담당
   * 범위 안에 있어야 한다. 실장 이상은 항상 `true`다.
   */
  async canCoverSubjects(
    actor: AuthenticatedUser,
    subjectIds: readonly string[],
  ): Promise<boolean> {
    if (this.isPrivileged(actor.role)) {
      return true;
    }

    const accessible = new Set(await this.getAccessibleSubjectIds(actor.id));

    return subjectIds.every((subjectId) => accessible.has(subjectId));
  }

  /**
   * 강사가 이미 존재하는 템플릿을 조회·수정할 수 있는지 확인한다.
   *
   * 본인이 만든 템플릿이거나, 템플릿의 과목 전체를 담당 중이면 허용한다.
   */
  async canAccessTemplate(
    actor: AuthenticatedUser,
    template: { createdById: string | null; subjectIds: readonly string[] },
  ): Promise<boolean> {
    if (this.isPrivileged(actor.role)) {
      return true;
    }

    if (template.createdById === actor.id) {
      return true;
    }

    return this.canCoverSubjects(actor, template.subjectIds);
  }
}
