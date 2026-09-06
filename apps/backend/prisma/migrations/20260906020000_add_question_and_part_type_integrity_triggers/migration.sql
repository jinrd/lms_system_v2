-- 문제 유형별 보기·정답 개수와 필기·실기 하위 데이터 혼입을 DB에서 막는다.
-- 기획안 §32("문제 유형별 보기·정답 개수 ... 지연 제약 트리거",
-- "필기·실기 하위 데이터 혼입 차단 ... 트리거")와 §12.1·§13.4·§13.5.
--
-- 애플리케이션 계층(questions.service, exam-template-composition.service)이
-- 같은 규칙을 먼저 검증해 이해 가능한 오류를 돌려주고, 이 트리거는 그 검증을
-- 우회한 쓰기에 대한 최종 방어선이다.

-- ============================================================================
-- 1. 문제 유형별 보기·정답 개수 (지연 제약 트리거)
-- ============================================================================
-- 문제 본체·보기·허용 정답은 한 트랜잭션에서 여러 문장으로 만들어지므로,
-- 개수 규칙은 커밋 시점에만 확인할 수 있다. DEFERRABLE INITIALLY DEFERRED.
--
-- 규칙(§12.1):
--   SINGLE_CHOICE  : 보기 >= 2, 정답 보기 정확히 1개, 허용 정답 0개
--   MULTIPLE_CHOICE: 보기 >= 2, 정답 보기 >= 1,       허용 정답 0개
--   SHORT_ANSWER   : 보기 0개, 허용 정답 >= 1

CREATE OR REPLACE FUNCTION check_question_structure(p_question_id UUID)
RETURNS void AS $$
DECLARE
  v_type          "question_type";
  v_option_count  INTEGER;
  v_correct_count INTEGER;
  v_answer_count  INTEGER;
BEGIN
  SELECT "type" INTO v_type
    FROM "question_bank" WHERE "id" = p_question_id;

  IF NOT FOUND THEN
    RETURN; -- 문제가 이미 삭제됨(상위 삭제의 연쇄)
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE "is_correct")
    INTO v_option_count, v_correct_count
    FROM "question_options" WHERE "question_id" = p_question_id;

  SELECT COUNT(*) INTO v_answer_count
    FROM "question_accepted_answers" WHERE "question_id" = p_question_id;

  IF v_type = 'SHORT_ANSWER' THEN
    IF v_option_count > 0 THEN
      RAISE EXCEPTION 'SHORT_ANSWER question % must have no options', p_question_id;
    END IF;
    IF v_answer_count < 1 THEN
      RAISE EXCEPTION 'SHORT_ANSWER question % needs at least 1 accepted answer', p_question_id;
    END IF;
  ELSE
    IF v_answer_count > 0 THEN
      RAISE EXCEPTION 'choice question % must have no accepted answers', p_question_id;
    END IF;
    IF v_option_count < 2 THEN
      RAISE EXCEPTION 'choice question % needs at least 2 options', p_question_id;
    END IF;
    IF v_type = 'SINGLE_CHOICE' AND v_correct_count <> 1 THEN
      RAISE EXCEPTION 'SINGLE_CHOICE question % needs exactly 1 correct option (has %)', p_question_id, v_correct_count;
    END IF;
    IF v_type = 'MULTIPLE_CHOICE' AND v_correct_count < 1 THEN
      RAISE EXCEPTION 'MULTIPLE_CHOICE question % needs at least 1 correct option', p_question_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_question_bank_structure()
RETURNS trigger AS $$
BEGIN
  -- INSERT, 또는 유형이 바뀐 UPDATE 에서만 재확인한다.
  IF TG_OP = 'INSERT' OR NEW."type" IS DISTINCT FROM OLD."type" THEN
    PERFORM check_question_structure(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_question_options_structure()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_question_structure(OLD."question_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_question_structure(NEW."question_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_question_answers_structure()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_question_structure(OLD."question_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_question_structure(NEW."question_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "question_bank_structure_check"
  AFTER INSERT OR UPDATE ON "question_bank"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_question_bank_structure();

CREATE CONSTRAINT TRIGGER "question_options_structure_check"
  AFTER INSERT OR UPDATE OR DELETE ON "question_options"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_question_options_structure();

CREATE CONSTRAINT TRIGGER "question_accepted_answers_structure_check"
  AFTER INSERT OR UPDATE OR DELETE ON "question_accepted_answers"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_question_answers_structure();

-- ============================================================================
-- 2. 필기·실기 하위 데이터 혼입 차단 (즉시 제약 트리거)
-- ============================================================================
-- exam_template_questions 는 WRITTEN 파트에만, exam_template_practical_criteria
-- 는 PRACTICAL 파트에만 붙을 수 있다(§13.4, §13.5). 파트는 하위 행보다 먼저
-- 존재하므로 지연시킬 필요 없이 즉시 확인한다.

CREATE OR REPLACE FUNCTION trg_check_exam_template_question_part_type()
RETURNS trigger AS $$
DECLARE
  v_type "exam_part_type";
BEGIN
  SELECT "type" INTO v_type
    FROM "exam_template_parts" WHERE "id" = NEW."exam_template_part_id";

  IF v_type IS DISTINCT FROM 'WRITTEN' THEN
    RAISE EXCEPTION
      'exam_template_questions row % must attach to a WRITTEN part (part % is %)',
      NEW."id", NEW."exam_template_part_id", COALESCE(v_type::text, 'missing');
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_exam_template_criterion_part_type()
RETURNS trigger AS $$
DECLARE
  v_type "exam_part_type";
BEGIN
  SELECT "type" INTO v_type
    FROM "exam_template_parts" WHERE "id" = NEW."exam_template_part_id";

  IF v_type IS DISTINCT FROM 'PRACTICAL' THEN
    RAISE EXCEPTION
      'exam_template_practical_criteria row % must attach to a PRACTICAL part (part % is %)',
      NEW."id", NEW."exam_template_part_id", COALESCE(v_type::text, 'missing');
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_template_questions_part_type_check"
  AFTER INSERT OR UPDATE ON "exam_template_questions"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_question_part_type();

CREATE CONSTRAINT TRIGGER "exam_template_criteria_part_type_check"
  AFTER INSERT OR UPDATE ON "exam_template_practical_criteria"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_criterion_part_type();

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32)
-- ============================================================================
-- 아래를 실행해 트리거 5개와 함수 8개가 생성됐는지 확인한다.
--
--   SELECT tgname FROM pg_trigger
--    WHERE tgname IN (
--      'question_bank_structure_check',
--      'question_options_structure_check',
--      'question_accepted_answers_structure_check',
--      'exam_template_questions_part_type_check',
--      'exam_template_criteria_part_type_check'
--    );
--   -- 기대: 5행
--
--   SELECT proname FROM pg_proc
--    WHERE proname IN (
--      'check_question_structure',
--      'trg_check_question_bank_structure',
--      'trg_check_question_options_structure',
--      'trg_check_question_answers_structure',
--      'trg_check_exam_template_question_part_type',
--      'trg_check_exam_template_criterion_part_type'
--    );
--   -- 기대: 6행
--
-- 동작 확인 예:
--   -- 보기 없는 SINGLE_CHOICE 를 raw 로 넣으면 커밋 시 거부된다.
--   BEGIN;
--     INSERT INTO question_bank (subject_id, type, prompt, default_score, difficulty, active, updated_at)
--     SELECT id, 'SINGLE_CHOICE', 'x', 1, 'EASY', false, now() FROM subjects LIMIT 1;
--   COMMIT;  -- ERROR: SINGLE_CHOICE question ... needs at least 2 options
--
--   -- PRACTICAL 파트에 문제를 raw 로 넣으면 즉시 거부된다.
--   INSERT INTO exam_template_questions (exam_template_part_id, question_id, display_order, score)
--   SELECT p.id, q.id, 0, 1
--     FROM exam_template_parts p, question_bank q
--    WHERE p.type = 'PRACTICAL' LIMIT 1;  -- ERROR: ... must attach to a WRITTEN part

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
-- 이 마이그레이션을 되돌리려면 아래를 순서대로 실행한다.
--
--   DROP TRIGGER IF EXISTS "exam_template_criteria_part_type_check" ON "exam_template_practical_criteria";
--   DROP TRIGGER IF EXISTS "exam_template_questions_part_type_check" ON "exam_template_questions";
--   DROP TRIGGER IF EXISTS "question_accepted_answers_structure_check" ON "question_accepted_answers";
--   DROP TRIGGER IF EXISTS "question_options_structure_check" ON "question_options";
--   DROP TRIGGER IF EXISTS "question_bank_structure_check" ON "question_bank";
--   DROP FUNCTION IF EXISTS trg_check_exam_template_criterion_part_type();
--   DROP FUNCTION IF EXISTS trg_check_exam_template_question_part_type();
--   DROP FUNCTION IF EXISTS trg_check_question_answers_structure();
--   DROP FUNCTION IF EXISTS trg_check_question_options_structure();
--   DROP FUNCTION IF EXISTS trg_check_question_bank_structure();
--   DROP FUNCTION IF EXISTS check_question_structure(UUID);
