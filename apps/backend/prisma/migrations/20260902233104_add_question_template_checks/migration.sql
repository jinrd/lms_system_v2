-- 문제은행과 시험 템플릿의 값 범위를 DB에서 막는다.
-- 기획안 Part II §12.1, §13.3, §13.4, §13.5의 제약·검증 항목 중
-- 한 행만 보고 판정할 수 있는 규칙을 CHECK 제약으로 옮긴 것이다.
--
-- 여러 행의 합계나 개수를 확인해야 하는 규칙(문제 배점 합계 = 파트 총점,
-- 유형별 보기·정답 개수)은 일반 CHECK로 표현할 수 없다. 그 규칙들은
-- 템플릿 활성화 검증과 지연 제약 트리거에서 따로 처리한다. 초안 상태의
-- 템플릿은 합계가 맞지 않는 것이 정상이므로 여기서 막으면 안 된다.

-- 1. 문제은행 문제
ALTER TABLE "question_bank"
  ADD CONSTRAINT "chk_question_bank_default_score_positive"
  CHECK ("default_score" > 0);

ALTER TABLE "question_bank"
  ADD CONSTRAINT "chk_question_bank_prompt_not_blank"
  CHECK (btrim("prompt") <> '');

-- 2. 객관식 보기
ALTER TABLE "question_options"
  ADD CONSTRAINT "chk_question_options_content_not_blank"
  CHECK (btrim("content") <> '');

-- 3. 단답형 허용 정답
-- 정규화 결과가 빈 문자열이면 채점 기준으로 쓸 수 없으므로 저장을 막는다.
ALTER TABLE "question_accepted_answers"
  ADD CONSTRAINT "chk_question_accepted_answers_text_not_blank"
  CHECK (btrim("answer_text") <> '');

ALTER TABLE "question_accepted_answers"
  ADD CONSTRAINT "chk_question_accepted_answers_normalized_not_blank"
  CHECK (btrim("normalized_answer") <> '');

-- 4. 시험 템플릿
ALTER TABLE "exam_templates"
  ADD CONSTRAINT "chk_exam_templates_name_not_blank"
  CHECK (btrim("name") <> '');

ALTER TABLE "exam_templates"
  ADD CONSTRAINT "chk_exam_templates_default_open_days_positive"
  CHECK ("default_open_days" IS NULL OR "default_open_days" > 0);

-- 5. 템플릿 파트 공통 값
ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_total_score_positive"
  CHECK ("total_score" > 0);

ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_pass_score_range"
  CHECK ("pass_score" >= 0 AND "pass_score" <= "total_score");

ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_open_days_positive"
  CHECK ("default_open_days" > 0);

ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_open_offset_not_negative"
  CHECK ("default_open_offset_days" >= 0);

-- 6. 템플릿 파트의 유형별 열 배타 조건
-- 필기 파트는 제한 시간만, 실기 파트는 파일 제한만 가진다.
-- 반대쪽 열이 채워져 있으면 화면과 채점이 잘못된 값을 읽게 된다.
ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_written_columns"
  CHECK (
    "type" <> 'WRITTEN'::"exam_part_type"
    OR (
      "duration_minutes" IS NOT NULL AND "duration_minutes" > 0
      AND "min_files" IS NULL
      AND "max_files" IS NULL
      AND "max_file_size_bytes" IS NULL
      AND "max_total_size_bytes" IS NULL
    )
  );

-- 실기 파일 제한은 기획안 §8.5의 기본 정책이 상한이다.
-- 템플릿은 이보다 더 엄격하게만 설정할 수 있고 완화할 수 없다.
ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_practical_columns"
  CHECK (
    "type" <> 'PRACTICAL'::"exam_part_type"
    OR (
      "duration_minutes" IS NULL
      AND "min_files" IS NOT NULL AND "min_files" >= 1
      AND "max_files" IS NOT NULL AND "max_files" <= 5
      AND "min_files" <= "max_files"
      AND "max_file_size_bytes" IS NOT NULL
      AND "max_file_size_bytes" > 0
      AND "max_file_size_bytes" <= 10485760
      AND "max_total_size_bytes" IS NOT NULL
      AND "max_total_size_bytes" > 0
      AND "max_total_size_bytes" <= 41943040
    )
  );

-- 7. 템플릿에 선택된 문제와 실기 평가 항목
ALTER TABLE "exam_template_questions"
  ADD CONSTRAINT "chk_exam_template_questions_score_positive"
  CHECK ("score" > 0);

ALTER TABLE "exam_template_practical_criteria"
  ADD CONSTRAINT "chk_exam_template_practical_criteria_max_score_positive"
  CHECK ("max_score" > 0);

ALTER TABLE "exam_template_practical_criteria"
  ADD CONSTRAINT "chk_exam_template_practical_criteria_name_not_blank"
  CHECK (btrim("name") <> '');
