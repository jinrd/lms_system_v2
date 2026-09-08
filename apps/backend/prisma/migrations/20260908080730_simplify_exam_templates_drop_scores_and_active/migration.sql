-- 시험 템플릿을 "상태 없는 문제 참조 묶음"으로 축소한다.
--
-- 결정 사항:
--  * 템플릿에서 점수 세팅을 모두 제거한다: exam_template_parts.total_score,
--    exam_template_parts.pass_score, exam_template_questions.score.
--    배점·총점·합격점은 실제 시험을 만들 때 정하고 §14.9(예약 전 검증)에서
--    합계를 확인한다. 실제 시험 쪽 컬럼(exam_parts.*, exam_questions.score)은 유지.
--  * exam_templates.active 플래그와 활성화 개념을 제거한다. 템플릿은 항상
--    편집·삭제 가능하고, "쓸 수 있는지"는 실제 시험 생성 시점에만 판정한다.
--  * 활성화 검증용 지연 제약 트리거(§13.6)는 검증 지점이 실제 시험으로 옮겨가
--    더 이상 필요 없다.
--
-- 롤백: 이 마이그레이션은 컬럼과 트리거를 되돌리지 않는다. 필요하면
--       20260902233104, 20260906010000 마이그레이션의 해당 DDL을 다시 적용한다.

-- 1. 활성화 검증 지연 제약 트리거와 함수 제거 (20260906010000)
DROP TRIGGER IF EXISTS "exam_templates_activation_check" ON "exam_templates";
DROP TRIGGER IF EXISTS "exam_template_parts_totals_check" ON "exam_template_parts";
DROP TRIGGER IF EXISTS "exam_template_questions_totals_check" ON "exam_template_questions";
DROP TRIGGER IF EXISTS "exam_template_criteria_totals_check" ON "exam_template_practical_criteria";
DROP FUNCTION IF EXISTS trg_check_exam_template_activation();
DROP FUNCTION IF EXISTS trg_check_exam_template_parts();
DROP FUNCTION IF EXISTS trg_check_exam_template_questions();
DROP FUNCTION IF EXISTS trg_check_exam_template_criteria();
DROP FUNCTION IF EXISTS check_exam_template_part_totals(UUID);

-- 2. 삭제되는 컬럼을 참조하는 CHECK 제약 제거 (20260902233104)
ALTER TABLE "exam_template_parts"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_total_score_positive";
ALTER TABLE "exam_template_parts"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_parts_pass_score_range";
ALTER TABLE "exam_template_questions"
  DROP CONSTRAINT IF EXISTS "chk_exam_template_questions_score_positive";

-- 3. 컬럼 제거
ALTER TABLE "exam_template_parts" DROP COLUMN "pass_score",
DROP COLUMN "total_score";

ALTER TABLE "exam_template_questions" DROP COLUMN "score";

ALTER TABLE "exam_templates" DROP COLUMN "active";
