import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { QuestionAccessService } from '../questions/question-access.service';

/**
 * 실제 시험의 강사 접근 범위(결정 D-50)를 판정한다.
 *
 * 담당 강사는 반이 아니라 교육과정에 배정된다. 따라서 강사는 본인이 담당하는
 * 보관되지 않은 교육과정(`course_offerings.instructor_id`)의 시험만 생성·수정·
 * 채점·공개·정정할 수 있다. 예외로 본인이 만든 시험(`created_by`)은 담당
 * 교육과정이 바뀌어도 계속 다룰 수 있고, 실장·원장·관리자는 전체 범위다.
 *
 * `class_instructor_assignments`는 과거 이력 보존용 레거시라 판정에 쓰지 않는다.
 */
@Injectable()
export class ExamAccessService {
  constructor(private readonly questionAccess: QuestionAccessService) {}

  isPrivileged(role: UserRole): boolean {
    return this.questionAccess.isPrivileged(role);
  }

  /** 강사가 담당 교육과정을 통해 접근할 수 있는 세부 과목 식별자 집합이다. */
  getAccessibleSubjectIds(instructorId: string): Promise<string[]> {
    return this.questionAccess.getAccessibleSubjectIds(instructorId);
  }

  /**
   * 강사가 주어진 세부 과목 전체를 담당하는지 확인한다.
   *
   * 새 시험을 템플릿으로 만들 때 대상 과목이 모두 담당 범위 안이어야 한다.
   * 실장 이상은 항상 `true`다.
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
   * 강사가 이미 존재하는 시험을 조회·관리할 수 있는지 확인한다.
   *
   * 담당 교육과정의 시험이거나 본인이 만든 시험이면 허용한다. 그 외에 대상
   * 과목 전체가 담당 범위 안이면 허용한다(담당 교육과정이 여러 개인 경우 대비).
   */
  async canManageExam(
    actor: AuthenticatedUser,
    exam: {
      courseOfferingInstructorId: string;
      createdById: string | null;
      subjectIds: readonly string[];
    },
  ): Promise<boolean> {
    if (this.isPrivileged(actor.role)) {
      return true;
    }

    if (exam.createdById === actor.id) {
      return true;
    }

    if (exam.courseOfferingInstructorId === actor.id) {
      return true;
    }

    if (exam.subjectIds.length === 0) {
      return false;
    }

    return this.canCoverSubjects(actor, exam.subjectIds);
  }
}
