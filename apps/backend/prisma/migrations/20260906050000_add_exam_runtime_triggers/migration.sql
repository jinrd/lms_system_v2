-- 예약된 실제 시험(exams.status <> 'DRAFT')의 점수 합계·상태 전이·파트 유형
-- 혼입을 DB에서 보장한다.
--
-- 기획안 §14.9·§15.2·§32: 애플리케이션 계층(exam-schedule-validation.service.ts,
-- exams.service.ts)이 먼저 검증해 이해 가능한 오류를 내지만, psql 직접 수정이나
-- 다른 경로의 우회 쓰기는 막지 못한다. DEFERRABLE INITIALLY DEFERRED 제약
-- 트리거로 커밋 시점에만 합계를 확인해, 한 트랜잭션 안에서는 여러 행을 자유롭게
-- 바꿀 수 있게 한다.
--
-- 핵심: 합계 검사 대상은 DRAFT 를 벗어난 시험뿐이다. 초안은 합계가 맞지 않는
-- 것이 정상이므로(1단계까지의 편집이 자유로워야 한다) 절대 막지 않는다.

-- ============================================================================
-- 1. 파트 배점 합계 = 파트 총점  (예약된 시험에 한해)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_exam_part_totals(p_part_id UUID)
RETURNS void AS $$
DECLARE
  v_type    "exam_part_type";
  v_total   NUMERIC;
  v_exam_id UUID;
  v_status  "exam_status";
  v_sum     NUMERIC;
  v_count   INTEGER;
BEGIN
  SELECT "type", "total_score", "exam_id"
    INTO v_type, v_total, v_exam_id
    FROM "exam_parts"
   WHERE "id" = p_part_id;

  IF NOT FOUND THEN
    RETURN;  -- 상위 삭제의 연쇄로 파트가 이미 없으면 검사할 것이 없다.
  END IF;

  SELECT "status" INTO v_status FROM "exams" WHERE "id" = v_exam_id;
  IF NOT FOUND OR v_status = 'DRAFT' THEN
    RETURN;
  END IF;

  IF v_type = 'WRITTEN' THEN
    SELECT COALESCE(SUM("score"), 0), COUNT(*)
      INTO v_sum, v_count
      FROM "exam_questions"
     WHERE "exam_part_id" = p_part_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION
        'scheduled exam WRITTEN part % has no questions', p_part_id;
    END IF;
  ELSE
    SELECT COALESCE(SUM("max_score"), 0), COUNT(*)
      INTO v_sum, v_count
      FROM "exam_practical_criteria"
     WHERE "exam_part_id" = p_part_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION
        'scheduled exam PRACTICAL part % has no criteria', p_part_id;
    END IF;
  END IF;

  IF v_sum <> v_total THEN
    RAISE EXCEPTION
      'scheduled exam part % score sum % does not match total %',
      p_part_id, v_sum, v_total;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_check_exam_questions_totals()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_exam_part_totals(OLD."exam_part_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_exam_part_totals(NEW."exam_part_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_questions_totals_check"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_questions_totals();

CREATE OR REPLACE FUNCTION trg_check_exam_criteria_totals()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_exam_part_totals(OLD."exam_part_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_exam_part_totals(NEW."exam_part_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_criteria_totals_check"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_practical_criteria"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_criteria_totals();

CREATE OR REPLACE FUNCTION trg_check_exam_parts_totals()
RETURNS trigger AS $$
BEGIN
  IF NEW."total_score" IS DISTINCT FROM OLD."total_score" THEN
    PERFORM check_exam_part_totals(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_parts_totals_check"
  AFTER UPDATE ON "exam_parts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_parts_totals();

-- ============================================================================
-- 2. 시험 상태 전이  (DRAFT -> SCHEDULED 게이트, 역행 차단)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_check_exam_status_transition()
RETURNS trigger AS $$
DECLARE
  v_part_count INTEGER;
  v_part_id    UUID;
BEGIN
  -- 예약을 벗어난 시험이 다시 DRAFT 로 돌아갈 수 없다(기획안 §31).
  IF OLD."status" <> 'DRAFT' AND NEW."status" = 'DRAFT' THEN
    RAISE EXCEPTION 'exam % cannot return to DRAFT from %', NEW."id", OLD."status";
  END IF;

  -- DRAFT -> SCHEDULED 전환 시 파트가 최소 1개 있고 모든 파트 합계가 맞아야 한다.
  IF OLD."status" = 'DRAFT' AND NEW."status" = 'SCHEDULED' THEN
    SELECT COUNT(*) INTO v_part_count
      FROM "exam_parts" WHERE "exam_id" = NEW."id";

    IF v_part_count = 0 THEN
      RAISE EXCEPTION 'scheduled exam % has no parts', NEW."id";
    END IF;

    FOR v_part_id IN
      SELECT "id" FROM "exam_parts" WHERE "exam_id" = NEW."id"
    LOOP
      PERFORM check_exam_part_totals(v_part_id);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exams_status_transition_check"
  AFTER UPDATE ON "exams"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_status_transition();

-- ============================================================================
-- 3. 파트 유형 혼입 차단  (필기 문제는 WRITTEN, 실기 기준은 PRACTICAL)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_check_exam_question_part_type()
RETURNS trigger AS $$
DECLARE
  v_type "exam_part_type";
BEGIN
  SELECT "type" INTO v_type FROM "exam_parts" WHERE "id" = NEW."exam_part_id";
  IF v_type <> 'WRITTEN' THEN
    RAISE EXCEPTION 'exam question % must belong to a WRITTEN part', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_questions_part_type_check"
  BEFORE INSERT OR UPDATE ON "exam_questions"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_question_part_type();

CREATE OR REPLACE FUNCTION trg_check_exam_criterion_part_type()
RETURNS trigger AS $$
DECLARE
  v_type "exam_part_type";
BEGIN
  SELECT "type" INTO v_type FROM "exam_parts" WHERE "id" = NEW."exam_part_id";
  IF v_type <> 'PRACTICAL' THEN
    RAISE EXCEPTION 'exam practical criterion % must belong to a PRACTICAL part',
      NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_criteria_part_type_check"
  BEFORE INSERT OR UPDATE ON "exam_practical_criteria"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_criterion_part_type();

-- ============================================================================
-- 4. 채점 점수 상한  (파트 제출 점수 <= 파트 총점, 실기 항목 점수 <= 항목 최대)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_check_exam_part_submission_score()
RETURNS trigger AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF NEW."score" IS NOT NULL THEN
    SELECT "total_score" INTO v_total
      FROM "exam_parts" WHERE "id" = NEW."exam_part_id";
    IF NEW."score" > v_total THEN
      RAISE EXCEPTION
        'exam part submission % score % exceeds part total %',
        NEW."id", NEW."score", v_total;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_part_submissions_score_bound_check"
  BEFORE INSERT OR UPDATE ON "exam_part_submissions"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_part_submission_score();

CREATE OR REPLACE FUNCTION trg_check_practical_score_bound()
RETURNS trigger AS $$
DECLARE
  v_max NUMERIC;
BEGIN
  SELECT "max_score" INTO v_max
    FROM "exam_practical_criteria" WHERE "id" = NEW."criterion_id";
  IF NEW."score" > v_max THEN
    RAISE EXCEPTION
      'practical score % exceeds criterion max %', NEW."score", v_max;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "practical_scores_bound_check"
  BEFORE INSERT OR UPDATE ON "practical_scores"
  FOR EACH ROW EXECUTE FUNCTION trg_check_practical_score_bound();

-- ============================================================================
-- 5. 필기 답안 유형 혼입 차단  (연결 파트 WRITTEN, 객관식은 주관식 열 금지)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_check_exam_answer_shape()
RETURNS trigger AS $$
DECLARE
  v_part_type "exam_part_type";
  v_q_type    "question_type";
BEGIN
  SELECT "type" INTO v_part_type
    FROM "exam_parts" WHERE "id" = NEW."exam_part_id";
  IF v_part_type <> 'WRITTEN' THEN
    RAISE EXCEPTION 'exam answer % must belong to a WRITTEN part', NEW."id";
  END IF;

  SELECT "type" INTO v_q_type
    FROM "exam_questions" WHERE "id" = NEW."exam_question_id";
  IF v_q_type IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
     AND (NEW."subjective_text" IS NOT NULL OR NEW."normalized_text" IS NOT NULL)
  THEN
    RAISE EXCEPTION
      'objective exam answer % must not carry subjective text', NEW."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_answers_shape_check"
  BEFORE INSERT OR UPDATE ON "exam_answers"
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_answer_shape();

-- ============================================================================
-- 6. 결과 정정 이력은 수정 불가  (기획안 §15.6)
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_block_exam_result_revision_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'exam_result_revisions rows are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "exam_result_revisions_immutable"
  BEFORE UPDATE OR DELETE ON "exam_result_revisions"
  FOR EACH ROW EXECUTE FUNCTION trg_block_exam_result_revision_mutation();

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32)
-- ============================================================================
--   SELECT tgrelid::regclass::text AS table_name, tgname
--     FROM pg_trigger
--    WHERE NOT tgisinternal
--      AND tgname IN (
--        'exam_questions_totals_check', 'exam_criteria_totals_check',
--        'exam_parts_totals_check', 'exams_status_transition_check',
--        'exam_questions_part_type_check', 'exam_criteria_part_type_check',
--        'exam_part_submissions_score_bound_check', 'practical_scores_bound_check',
--        'exam_answers_shape_check', 'exam_result_revisions_immutable'
--      )
--    ORDER BY 1, 2;
--   -- 기대: 10행
--
-- 동작 확인:
--   -- 예약된 시험의 문제 배점을 psql 로 직접 바꾸면(합계가 깨지면) 커밋 시 거부.
--   BEGIN;
--   UPDATE exam_questions SET score = score + 1
--    WHERE exam_id = (SELECT id FROM exams WHERE status = 'SCHEDULED' LIMIT 1)
--    LIMIT 1;
--   COMMIT;   -- ERROR: scheduled exam part ... score sum ... does not match total ...
--
--   -- 결과 정정 이력 수정 시도
--   UPDATE exam_result_revisions SET reason = 'x' WHERE true;
--   -- ERROR: exam_result_revisions rows are immutable

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
--   DROP TRIGGER "exam_result_revisions_immutable"           ON "exam_result_revisions";
--   DROP TRIGGER "exam_answers_shape_check"                  ON "exam_answers";
--   DROP TRIGGER "practical_scores_bound_check"              ON "practical_scores";
--   DROP TRIGGER "exam_part_submissions_score_bound_check"   ON "exam_part_submissions";
--   DROP TRIGGER "exam_criteria_part_type_check"             ON "exam_practical_criteria";
--   DROP TRIGGER "exam_questions_part_type_check"            ON "exam_questions";
--   DROP TRIGGER "exams_status_transition_check"             ON "exams";
--   DROP TRIGGER "exam_parts_totals_check"                   ON "exam_parts";
--   DROP TRIGGER "exam_criteria_totals_check"                ON "exam_practical_criteria";
--   DROP TRIGGER "exam_questions_totals_check"               ON "exam_questions";
--   DROP FUNCTION IF EXISTS trg_block_exam_result_revision_mutation();
--   DROP FUNCTION IF EXISTS trg_check_exam_answer_shape();
--   DROP FUNCTION IF EXISTS trg_check_practical_score_bound();
--   DROP FUNCTION IF EXISTS trg_check_exam_part_submission_score();
--   DROP FUNCTION IF EXISTS trg_check_exam_criterion_part_type();
--   DROP FUNCTION IF EXISTS trg_check_exam_question_part_type();
--   DROP FUNCTION IF EXISTS trg_check_exam_status_transition();
--   DROP FUNCTION IF EXISTS trg_check_exam_parts_totals();
--   DROP FUNCTION IF EXISTS trg_check_exam_criteria_totals();
--   DROP FUNCTION IF EXISTS trg_check_exam_questions_totals();
--   DROP FUNCTION IF EXISTS check_exam_part_totals(UUID);
