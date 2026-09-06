-- 활성 시험 템플릿의 점수 합계를 DB에서 보장한다.
-- 기획안 Part II §13.6: 서비스 검증만으로는 우회 쓰기(psql 직접 수정, 다른 경로)를
-- 막지 못한다. DEFERRABLE INITIALLY DEFERRED 제약 트리거로 커밋 시점에만
-- 합계를 확인해, 한 트랜잭션 안에서는 자유롭게 여러 행을 바꿀 수 있게 한다.
--
-- 핵심: 검사 대상은 `active = true` 인 템플릿뿐이다. 초안(active = false)은
-- 합계가 맞지 않는 것이 정상이므로 절대 막지 않는다. 5단계까지의 편집이
-- 초안 상태에서 자유로워야 하기 때문이다.
--
-- 합계 일치·문제은행 규칙 재검증 등 전체 활성화 검증은 애플리케이션 계층
-- (exam-template-validation.service.ts)이 담당하고 실패 시 항목별 사유와 함께
-- 400을 낸다. 이 트리거는 그 검증을 우회한 쓰기에 대한 방어선이다.

-- 한 파트의 배점 합계가 총점과 일치하는지(활성 템플릿에 한해) 확인한다.
-- 필기 파트는 exam_template_questions.score 합계를, 실기 파트는
-- exam_template_practical_criteria.max_score 합계를 파트 total_score 와 비교한다.
-- 파트가 이미 삭제됐으면(상위 삭제의 연쇄) 검사할 것이 없으므로 조용히 통과한다.
CREATE OR REPLACE FUNCTION check_exam_template_part_totals(p_part_id UUID)
RETURNS void AS $$
DECLARE
  v_type            "exam_part_type";
  v_total           NUMERIC;
  v_template_id     UUID;
  v_active          BOOLEAN;
  v_sum             NUMERIC;
  v_count           INTEGER;
BEGIN
  SELECT "type", "total_score", "exam_template_id"
    INTO v_type, v_total, v_template_id
    FROM "exam_template_parts"
   WHERE "id" = p_part_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "active" INTO v_active
    FROM "exam_templates"
   WHERE "id" = v_template_id;

  IF NOT FOUND OR NOT v_active THEN
    RETURN;
  END IF;

  IF v_type = 'WRITTEN' THEN
    SELECT COALESCE(SUM("score"), 0), COUNT(*)
      INTO v_sum, v_count
      FROM "exam_template_questions"
     WHERE "exam_template_part_id" = p_part_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION
        'active exam template WRITTEN part % has no questions', p_part_id;
    END IF;
  ELSE
    SELECT COALESCE(SUM("max_score"), 0), COUNT(*)
      INTO v_sum, v_count
      FROM "exam_template_practical_criteria"
     WHERE "exam_template_part_id" = p_part_id;

    IF v_count = 0 THEN
      RAISE EXCEPTION
        'active exam template PRACTICAL part % has no criteria', p_part_id;
    END IF;
  END IF;

  IF v_sum <> v_total THEN
    RAISE EXCEPTION
      'active exam template part % score sum % does not match total %',
      p_part_id, v_sum, v_total;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- exam_template_questions: 행이 바뀌면 소속 파트(들)의 합계를 재확인한다.
CREATE OR REPLACE FUNCTION trg_check_exam_template_questions()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_exam_template_part_totals(OLD."exam_template_part_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_exam_template_part_totals(NEW."exam_template_part_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_template_questions_totals_check"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_template_questions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_questions();

-- exam_template_practical_criteria: 동일.
CREATE OR REPLACE FUNCTION trg_check_exam_template_criteria()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM check_exam_template_part_totals(OLD."exam_template_part_id");
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM check_exam_template_part_totals(NEW."exam_template_part_id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_template_criteria_totals_check"
  AFTER INSERT OR UPDATE OR DELETE ON "exam_template_practical_criteria"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_criteria();

-- exam_template_parts: total_score 가 바뀌면 그 파트의 합계를 재확인한다.
-- (제약 트리거는 UPDATE OF <열> 을 지원하지 않으므로 함수 안에서 비교한다.)
CREATE OR REPLACE FUNCTION trg_check_exam_template_parts()
RETURNS trigger AS $$
BEGIN
  IF NEW."total_score" IS DISTINCT FROM OLD."total_score" THEN
    PERFORM check_exam_template_part_totals(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_template_parts_totals_check"
  AFTER UPDATE ON "exam_template_parts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_parts();

-- exam_templates: active 가 false -> true 로 바뀔 때 파트가 최소 1개 있어야 하고,
-- 존재하는 모든 파트의 합계가 총점과 맞아야 한다.
CREATE OR REPLACE FUNCTION trg_check_exam_template_activation()
RETURNS trigger AS $$
DECLARE
  v_part_count INTEGER;
  v_part_id    UUID;
BEGIN
  IF NEW."active" AND NOT OLD."active" THEN
    SELECT COUNT(*) INTO v_part_count
      FROM "exam_template_parts"
     WHERE "exam_template_id" = NEW."id";

    IF v_part_count = 0 THEN
      RAISE EXCEPTION 'active exam template % has no parts', NEW."id";
    END IF;

    FOR v_part_id IN
      SELECT "id" FROM "exam_template_parts"
       WHERE "exam_template_id" = NEW."id"
    LOOP
      PERFORM check_exam_template_part_totals(v_part_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "exam_templates_activation_check"
  AFTER UPDATE ON "exam_templates"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_check_exam_template_activation();
