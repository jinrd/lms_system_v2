-- 활성 수강 등록의 중복을 막는 부분 유니크 인덱스를 추가한다(기획안 §24·D-03).
--
-- 지금까지 이 두 규칙은 enrollments.service 의 트랜잭션 검증에만 있었고 DB
-- 최종 방어선이 없었다. 동시 요청이 검증을 함께 통과하면 중복 활성 등록이
-- 그대로 저장될 수 있다. init 마이그레이션이 만든 uq_enrollments_* 인덱스는
-- 모두 id 를 포함한 식별자 조합이라 이 업무 규칙과 무관하다.
--
-- Prisma 스키마로는 부분 유니크를 표현할 수 없어 SQL 마이그레이션에 직접
-- 작성한다(기획안 §32).

-- 같은 학생이 같은 반·교육과정에서 같은 유형의 활성 등록을 두 개 가질 수 없다.
CREATE UNIQUE INDEX "uq_enrollments_active_student_class_offering_type"
ON "enrollments" ("student_id", "class_id", "course_offering_id", "type")
WHERE "status" = 'ACTIVE'::"enrollment_status";

-- 한 학생은 같은 교육과정을 동시에 두 반에서 정규 수강할 수 없다(D-03).
CREATE UNIQUE INDEX "uq_enrollments_active_regular_student_offering"
ON "enrollments" ("student_id", "course_offering_id")
WHERE
  "type" = 'REGULAR'::"enrollment_type"
  AND "status" = 'ACTIVE'::"enrollment_status";

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32) — 각 쿼리는 0행을 반환해야 한다
-- ============================================================================
--   -- 인덱스 2개가 존재하는가
--   SELECT 2 - count(*)
--     FROM pg_indexes
--    WHERE tablename = 'enrollments'
--      AND indexname IN (
--        'uq_enrollments_active_student_class_offering_type',
--        'uq_enrollments_active_regular_student_offering'
--      );
--
--   -- 규칙을 이미 위반하는 데이터가 남아 있는가 (있으면 CREATE INDEX 가 실패했을 것)
--   SELECT student_id, class_id, course_offering_id, type
--     FROM enrollments
--    WHERE status = 'ACTIVE'
--    GROUP BY student_id, class_id, course_offering_id, type
--   HAVING count(*) > 1;
--
--   SELECT student_id, course_offering_id
--     FROM enrollments
--    WHERE status = 'ACTIVE' AND type = 'REGULAR'
--    GROUP BY student_id, course_offering_id
--   HAVING count(*) > 1;

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
--   DROP INDEX IF EXISTS "uq_enrollments_active_student_class_offering_type";
--   DROP INDEX IF EXISTS "uq_enrollments_active_regular_student_offering";
