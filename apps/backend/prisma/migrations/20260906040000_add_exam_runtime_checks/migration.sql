-- 실제 시험 런타임 테이블(exams 이하)의 한 행짜리 값 범위 CHECK 제약을 추가한다.
--
-- init 마이그레이션은 이 16개 테이블에 CHECK 제약도 트리거도 만들지 않았다.
-- 20260906010000·20260906020000 트리거 마이그레이션은 exam_template_*(템플릿)만
-- 대상이었고 exam_*(실제 시험)은 손대지 않았다. 기획안 §14.1·§14.4·§15.2가
-- 요구하는 DB 레벨 검증을 여기서 시작한다.
--
-- 여러 행을 가로지르는 검증(문제 배점 합계 = 파트 총점, 파트 제출 점수 <= 파트
-- 총점, 상태 전이, 필기·실기 혼입 차단)은 이 마이그레이션에 넣지 않는다.
-- 초안(DRAFT) 편집 중에는 합계가 안 맞는 것이 정상이므로, 예약된 시험에만
-- 적용되는 지연 제약 트리거로 2단계에서 처리한다(기획안 §32).

-- ============================================================================
-- exams
-- ============================================================================
ALTER TABLE "exams"
  ADD CONSTRAINT "chk_exams_time_order"
  CHECK ("opens_at" < "closes_at");

-- 취소 정보는 status = CANCELED 일 때만, 그리고 그때는 반드시 채워져 있어야 한다.
ALTER TABLE "exams"
  ADD CONSTRAINT "chk_exams_cancel_columns"
  CHECK (
    (
      "status" = 'CANCELED'::"exam_status"
      AND "canceled_at" IS NOT NULL
      AND "canceled_by" IS NOT NULL
      AND "cancel_reason" IS NOT NULL
    )
    OR (
      "status" <> 'CANCELED'::"exam_status"
      AND "canceled_at" IS NULL
      AND "canceled_by" IS NULL
      AND "cancel_reason" IS NULL
    )
  );

-- ============================================================================
-- exam_parts
-- ============================================================================
ALTER TABLE "exam_parts"
  ADD CONSTRAINT "chk_exam_parts_time_order"
  CHECK ("opens_at" < "closes_at");

ALTER TABLE "exam_parts"
  ADD CONSTRAINT "chk_exam_parts_score_range"
  CHECK (
    "total_score" > 0
    AND "pass_score" >= 0
    AND "pass_score" <= "total_score"
  );

-- 필기 파트: 제한 시간만 가지고 실기 파일 제한 열은 모두 NULL.
ALTER TABLE "exam_parts"
  ADD CONSTRAINT "chk_exam_parts_written_columns"
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

-- 실기 파트: 제한 시간은 NULL, 파일 제한은 채워짐. 파일당 크기는 5MiB 고정(D-49).
ALTER TABLE "exam_parts"
  ADD CONSTRAINT "chk_exam_parts_practical_columns"
  CHECK (
    "type" <> 'PRACTICAL'::"exam_part_type"
    OR (
      "duration_minutes" IS NULL
      AND "min_files" IS NOT NULL AND "min_files" >= 1
      AND "max_files" IS NOT NULL
      AND "min_files" <= "max_files"
      AND "max_file_size_bytes" = 5242880
      AND "max_total_size_bytes" IS NOT NULL
      AND "max_total_size_bytes" > 0
    )
  );

-- ============================================================================
-- exam_questions / exam_question_accepted_answers / exam_practical_criteria
-- ============================================================================
ALTER TABLE "exam_questions"
  ADD CONSTRAINT "chk_exam_questions_score_positive"
  CHECK ("score" > 0);

ALTER TABLE "exam_question_accepted_answers"
  ADD CONSTRAINT "chk_exam_question_accepted_answers_normalized_not_blank"
  CHECK (btrim("normalized_answer") <> '');

ALTER TABLE "exam_practical_criteria"
  ADD CONSTRAINT "chk_exam_practical_criteria_max_score_positive"
  CHECK ("max_score" > 0);

-- ============================================================================
-- exam_part_submissions / practical_scores
--   (상한이 다른 행 값에 걸리는 검증은 2단계 지연 제약 트리거에서 추가한다.)
-- ============================================================================
ALTER TABLE "exam_part_submissions"
  ADD CONSTRAINT "chk_exam_part_submissions_score_nonneg"
  CHECK ("score" IS NULL OR "score" >= 0);

ALTER TABLE "exam_part_submissions"
  ADD CONSTRAINT "chk_exam_part_submissions_submitted_at"
  CHECK (
    "status" NOT IN (
      'SUBMITTED'::"attempt_status",
      'GRADING'::"attempt_status",
      'GRADED'::"attempt_status"
    )
    OR "submitted_at" IS NOT NULL
  );

ALTER TABLE "exam_part_submissions"
  ADD CONSTRAINT "chk_exam_part_submissions_graded_columns"
  CHECK (
    "status" <> 'GRADED'::"attempt_status"
    OR ("score" IS NOT NULL AND "graded_at" IS NOT NULL)
  );

ALTER TABLE "practical_scores"
  ADD CONSTRAINT "chk_practical_scores_score_nonneg"
  CHECK ("score" >= 0);

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32)
-- ============================================================================
--   SELECT conrelid::regclass::text AS table_name, conname
--     FROM pg_constraint
--    WHERE contype = 'c'
--      AND conname LIKE 'chk_%'
--      AND conrelid::regclass::text IN (
--        'exams', 'exam_parts', 'exam_questions',
--        'exam_question_accepted_answers', 'exam_practical_criteria',
--        'exam_part_submissions', 'practical_scores'
--      )
--    ORDER BY 1, 2;
--   -- 기대: 13행
--
-- 위반 INSERT가 거부되는지 확인(각 1건):
--   -- opens_at >= closes_at
--   INSERT INTO exams (course_offering_id, title, scope, stage, status,
--                      opens_at, closes_at, updated_at)
--   SELECT id, 't', 'SUBJECT', 'REGULAR', 'DRAFT',
--          now(), now() - interval '1 hour', now()
--     FROM course_offerings LIMIT 1;
--   -- ERROR: chk_exams_time_order
--
--   -- 실기 파트에 5MiB 아닌 파일당 크기
--   INSERT INTO exam_parts (exam_id, type, total_score, pass_score,
--                           opens_at, closes_at, min_files, max_files,
--                           max_file_size_bytes, max_total_size_bytes)
--   SELECT id, 'PRACTICAL', 20, 12, now(), now() + interval '1 day',
--          1, 3, 10485760, 31457280
--     FROM exams LIMIT 1;
--   -- ERROR: chk_exam_parts_practical_columns

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
--   ALTER TABLE "exams"                          DROP CONSTRAINT "chk_exams_time_order";
--   ALTER TABLE "exams"                          DROP CONSTRAINT "chk_exams_cancel_columns";
--   ALTER TABLE "exam_parts"                     DROP CONSTRAINT "chk_exam_parts_time_order";
--   ALTER TABLE "exam_parts"                     DROP CONSTRAINT "chk_exam_parts_score_range";
--   ALTER TABLE "exam_parts"                     DROP CONSTRAINT "chk_exam_parts_written_columns";
--   ALTER TABLE "exam_parts"                     DROP CONSTRAINT "chk_exam_parts_practical_columns";
--   ALTER TABLE "exam_questions"                 DROP CONSTRAINT "chk_exam_questions_score_positive";
--   ALTER TABLE "exam_question_accepted_answers" DROP CONSTRAINT "chk_exam_question_accepted_answers_normalized_not_blank";
--   ALTER TABLE "exam_practical_criteria"        DROP CONSTRAINT "chk_exam_practical_criteria_max_score_positive";
--   ALTER TABLE "exam_part_submissions"          DROP CONSTRAINT "chk_exam_part_submissions_score_nonneg";
--   ALTER TABLE "exam_part_submissions"          DROP CONSTRAINT "chk_exam_part_submissions_submitted_at";
--   ALTER TABLE "exam_part_submissions"          DROP CONSTRAINT "chk_exam_part_submissions_graded_columns";
--   ALTER TABLE "practical_scores"               DROP CONSTRAINT "chk_practical_scores_score_nonneg";
