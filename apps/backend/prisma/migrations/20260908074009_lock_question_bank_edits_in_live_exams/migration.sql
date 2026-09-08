-- 진행 중인 실제 시험에 출제된 문제은행 문제의 수정·비활성화를 막는다.
-- 실제 시험은 문제를 스냅샷(exam_questions)으로 복사해 두므로 이미 시작된 시험의
-- 채점 결과는 원본을 바꿔도 흔들리지 않지만, 운영 정책상 "이미 출제되어 진행 중인
-- 문제"는 시험이 끝난 뒤에만 손댈 수 있게 한다. 서비스에서 먼저 이해 가능한 오류를
-- 내고, 이 트리거는 우회 쓰기를 막는 최종 방어선이다.
-- 시험이 COMPLETED·CANCELED 가 되면 잠금은 자동으로 풀린다(별도 정리 불필요).

-- CreateIndex
CREATE INDEX "exam_questions_source_question_id_idx" ON "exam_questions"("source_question_id");

-- 진행 중 시험 참조 여부를 검사하는 공용 트리거 함수
CREATE OR REPLACE FUNCTION reject_edit_of_question_in_live_exam()
RETURNS trigger AS $$
DECLARE
  target_question_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'question_bank' THEN
    target_question_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_question_id := COALESCE(NEW.question_id, OLD.question_id);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM exam_questions eq
    JOIN exams e ON e.id = eq.exam_id
    WHERE eq.source_question_id = target_question_id
      AND e.status NOT IN ('COMPLETED'::exam_status, 'CANCELED'::exam_status)
  ) THEN
    RAISE EXCEPTION
      '진행 중인 시험에 출제된 문제(%)는 시험이 끝난 뒤에만 수정할 수 있습니다.',
      target_question_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_question_bank_live_exam_edit_guard
  BEFORE UPDATE OR DELETE ON question_bank
  FOR EACH ROW EXECUTE FUNCTION reject_edit_of_question_in_live_exam();

CREATE TRIGGER trg_question_options_live_exam_edit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON question_options
  FOR EACH ROW EXECUTE FUNCTION reject_edit_of_question_in_live_exam();

CREATE TRIGGER trg_question_accepted_answers_live_exam_edit_guard
  BEFORE INSERT OR UPDATE OR DELETE ON question_accepted_answers
  FOR EACH ROW EXECUTE FUNCTION reject_edit_of_question_in_live_exam();

-- 적용 검증:
--   SELECT tgname FROM pg_trigger
--   WHERE tgname IN (
--     'trg_question_bank_live_exam_edit_guard',
--     'trg_question_options_live_exam_edit_guard',
--     'trg_question_accepted_answers_live_exam_edit_guard'
--   );
--   -- 3행이 나와야 한다.
--   SELECT to_regclass('exam_questions_source_question_id_idx') IS NOT NULL;

-- 롤백:
--   DROP TRIGGER IF EXISTS trg_question_accepted_answers_live_exam_edit_guard ON question_accepted_answers;
--   DROP TRIGGER IF EXISTS trg_question_options_live_exam_edit_guard ON question_options;
--   DROP TRIGGER IF EXISTS trg_question_bank_live_exam_edit_guard ON question_bank;
--   DROP FUNCTION IF EXISTS reject_edit_of_question_in_live_exam();
--   DROP INDEX IF EXISTS "exam_questions_source_question_id_idx";
