-- 2026-08-31 교육과정·반·수업 개편의 잔재를 제거한다.
--
-- 개편 전 구조: 반 1 : 교육과정 1 (classes.course_offering_id), 반 상태 컬럼,
--               교육과정이 기간·정원·상태·커리큘럼을 보유, 과목별 진도율 관리.
-- 개편 후 구조: 반 N : 교육과정 M (class_programs), 반 상태는 운영 기간으로 계산,
--               교육과정은 이름·기본 교육 분야·과목·담당 강사·보관 여부만 보유,
--               진도율은 관리하지 않고 수업 일지로 대체.

-- 1. 개편 이전에 만들어진 행의 반 교육과정 연결을 채운다.
UPDATE "class_subjects" cs
SET "class_program_id" = cp."id"
FROM "class_programs" cp
WHERE cs."class_program_id" IS NULL
  AND cp."class_id" = cs."class_id"
  AND cp."course_offering_id" = cs."course_offering_id";

UPDATE "class_schedule_patterns" p
SET "class_program_id" = cs."class_program_id"
FROM "class_subjects" cs
WHERE p."class_program_id" IS NULL
  AND cs."id" = p."class_subject_id";

UPDATE "class_sessions" s
SET "class_program_id" = cs."class_program_id"
FROM "class_subjects" cs
WHERE s."class_program_id" IS NULL
  AND cs."id" = s."class_subject_id";

-- 2. 진도율 관리는 폐기한다. (class_subjects 정리보다 먼저 삭제해야 한다)
DROP TABLE IF EXISTS "class_subject_progress";

-- 3. 그래도 연결되지 않은 잔여 행은 개편 이전 고아 데이터이므로 정리한다.
DELETE FROM "attendance_code_attempts"
WHERE "attendance_code_id" IN (
  SELECT ac."id" FROM "attendance_codes" ac
  JOIN "class_sessions" s ON s."id" = ac."class_session_id"
  WHERE s."class_program_id" IS NULL
);

DELETE FROM "attendance_codes"
WHERE "class_session_id" IN (
  SELECT "id" FROM "class_sessions" WHERE "class_program_id" IS NULL
);

DELETE FROM "attendance_change_histories"
WHERE "attendance_record_id" IN (
  SELECT ar."id" FROM "attendance_records" ar
  JOIN "class_sessions" s ON s."id" = ar."class_session_id"
  WHERE s."class_program_id" IS NULL
);

DELETE FROM "attendance_records"
WHERE "class_session_id" IN (
  SELECT "id" FROM "class_sessions" WHERE "class_program_id" IS NULL
);

DELETE FROM "session_participants"
WHERE "class_session_id" IN (
  SELECT "id" FROM "class_sessions" WHERE "class_program_id" IS NULL
);

UPDATE "class_sessions"
SET "replacement_for_session_id" = NULL
WHERE "replacement_for_session_id" IN (
  SELECT "id" FROM "class_sessions" WHERE "class_program_id" IS NULL
);

DELETE FROM "class_sessions" WHERE "class_program_id" IS NULL;
DELETE FROM "class_schedule_patterns" WHERE "class_program_id" IS NULL;
DELETE FROM "class_subjects" WHERE "class_program_id" IS NULL;

-- 4. 반 교육과정 연결을 필수로 만든다.
ALTER TABLE "class_subjects" ALTER COLUMN "class_program_id" SET NOT NULL;
ALTER TABLE "class_schedule_patterns" ALTER COLUMN "class_program_id" SET NOT NULL;
ALTER TABLE "class_sessions" ALTER COLUMN "class_program_id" SET NOT NULL;

-- 5. 반: 대표 교육과정 FK와 상태 컬럼을 제거한다.
--    반 이름 유니크가 교육과정 범위였으므로 함께 정리하고,
--    보관되지 않은 반끼리만 이름이 겹치지 않도록 부분 유니크 인덱스로 대체한다.
DROP INDEX IF EXISTS "uq_classes_offering_name";
DROP INDEX IF EXISTS "uq_classes_id_offering";
DROP INDEX IF EXISTS "idx_classes_offering_status";
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_course_offering_id_fkey";
ALTER TABLE "classes" DROP COLUMN "course_offering_id";
ALTER TABLE "classes" DROP COLUMN "status";

CREATE UNIQUE INDEX "uq_classes_active_name"
ON "classes"("name")
WHERE "archived_at" IS NULL;

-- 6. 교육과정: 운영 정보를 제거한다. (기간·정원·상태·설명·커리큘럼)
DROP INDEX IF EXISTS "idx_course_offerings_status_dates";
ALTER TABLE "course_offerings"
  DROP COLUMN "description",
  DROP COLUMN "curriculum",
  DROP COLUMN "start_date",
  DROP COLUMN "end_date",
  DROP COLUMN "capacity",
  DROP COLUMN "status";

-- 7. 교육과정 과목: 순서와 계획 정보를 제거한다.
ALTER TABLE "course_offering_subjects"
  DROP COLUMN "sequence",
  DROP COLUMN "planned_start_date",
  DROP COLUMN "planned_end_date",
  DROP COLUMN "planned_minutes",
  DROP COLUMN "curriculum";

-- 8. 더 이상 참조되지 않는 상태 enum을 제거한다.
DROP TYPE IF EXISTS "class_status";
DROP TYPE IF EXISTS "course_status";
