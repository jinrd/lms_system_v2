-- 실기 파트의 파일당 최대 크기를 5MiB(5242880 bytes)로 무조건 고정한다.
-- 이전에는 10MiB를 상한으로 두고 더 엄격한 값을 허용했으나, 정책을 "무엇을
-- 넣든 파일당 5MiB 고정"으로 확정했다. 애플리케이션 계층은 클라이언트 입력을
-- 무시하고 항상 이 값을 저장하며, DB CHECK도 이 값만 허용한다.

-- 1. 기존 실기 파트 행을 5MiB로 맞춘다(CHECK 교체가 실패하지 않도록 먼저).
UPDATE "exam_template_parts"
   SET "max_file_size_bytes" = 5242880
 WHERE "type" = 'PRACTICAL'
   AND "max_file_size_bytes" IS DISTINCT FROM 5242880;

-- 2. 실기 열 CHECK 제약을 파일당 크기 = 5242880 으로 다시 만든다.
--    (다른 조건은 20260902233104 마이그레이션과 동일하다.)
ALTER TABLE "exam_template_parts"
  DROP CONSTRAINT "chk_exam_template_parts_practical_columns";

ALTER TABLE "exam_template_parts"
  ADD CONSTRAINT "chk_exam_template_parts_practical_columns"
  CHECK (
    "type" <> 'PRACTICAL'::"exam_part_type"
    OR (
      "duration_minutes" IS NULL
      AND "min_files" IS NOT NULL AND "min_files" >= 1
      AND "max_files" IS NOT NULL AND "max_files" <= 5
      AND "min_files" <= "max_files"
      AND "max_file_size_bytes" = 5242880
      AND "max_total_size_bytes" IS NOT NULL
      AND "max_total_size_bytes" > 0
      AND "max_total_size_bytes" <= 41943040
    )
  );

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32)
-- ============================================================================
--   SELECT pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'chk_exam_template_parts_practical_columns';
--   -- 정의에 "max_file_size_bytes" = 5242880 이 포함되어야 한다.
--
--   SELECT DISTINCT max_file_size_bytes
--     FROM exam_template_parts WHERE type = 'PRACTICAL';
--   -- 5242880 하나만 나와야 한다.
--
-- 동작 확인:
--   -- 5MiB 가 아닌 값으로 실기 파트를 만들면 거부된다.
--   INSERT INTO exam_template_parts
--     (exam_template_id, type, total_score, pass_score, default_open_offset_days,
--      default_open_days, min_files, max_files, max_file_size_bytes,
--      max_total_size_bytes, updated_at)
--   SELECT id, 'PRACTICAL', 20, 12, 0, 7, 1, 3, 10485760, 31457280, now()
--     FROM exam_templates LIMIT 1;
--   -- ERROR: chk_exam_template_parts_practical_columns

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
-- 파일당 최대 크기를 다시 10MiB 상한(더 엄격한 값 허용)으로 되돌리려면:
--
--   ALTER TABLE "exam_template_parts"
--     DROP CONSTRAINT "chk_exam_template_parts_practical_columns";
--   ALTER TABLE "exam_template_parts"
--     ADD CONSTRAINT "chk_exam_template_parts_practical_columns"
--     CHECK (
--       "type" <> 'PRACTICAL'::"exam_part_type"
--       OR (
--         "duration_minutes" IS NULL
--         AND "min_files" IS NOT NULL AND "min_files" >= 1
--         AND "max_files" IS NOT NULL AND "max_files" <= 5
--         AND "min_files" <= "max_files"
--         AND "max_file_size_bytes" IS NOT NULL
--         AND "max_file_size_bytes" > 0
--         AND "max_file_size_bytes" <= 10485760
--         AND "max_total_size_bytes" IS NOT NULL
--         AND "max_total_size_bytes" > 0
--         AND "max_total_size_bytes" <= 41943040
--       )
--     );
--   -- 데이터(5MiB로 통일된 행)는 되돌리지 않는다.
