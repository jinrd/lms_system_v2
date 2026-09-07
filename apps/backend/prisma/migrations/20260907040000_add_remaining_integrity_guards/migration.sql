-- 10단계 감사에서 확인된 잔여 무결성 방어선을 채운다.
--
-- 1) §25 조회 인덱스 중 누락된 attendance_records(student_id, created_at)
-- 2) §32 "취소되지 않은 보강 수업" 부분 유니크
-- 3) §19.2 "문의 원문과 답글은 수정·삭제하지 않는다"의 DB 최종 방어선
--
-- 애플리케이션 계층이 먼저 검증하며, 이 제약은 동시 요청·직접 SQL에 대한
-- 마지막 방어선이다(기획안 §32).

-- ============================================================================
-- 1) 출석 기록 기간 조회 인덱스 (§25)
-- ============================================================================
CREATE INDEX "idx_attendance_records_student_created_at"
ON "attendance_records" ("student_id", "created_at");

-- ============================================================================
-- 2) 원수업당 취소되지 않은 보강 수업은 최대 1개 (§32)
-- ============================================================================
CREATE UNIQUE INDEX "uq_class_sessions_active_replacement"
ON "class_sessions" ("replacement_for_session_id")
WHERE
  "replacement_for_session_id" IS NOT NULL
  AND "status" <> 'CANCELED'::"session_status";

-- ============================================================================
-- 3) 문의 원문·답글 불변 보호 (§19.2)
-- ============================================================================
CREATE OR REPLACE FUNCTION "block_inquiry_reply_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '문의 답글은 수정하거나 삭제할 수 없습니다. 정정이 필요하면 새 답글을 남기세요.';
END;
$$;

CREATE TRIGGER "trg_block_inquiry_reply_mutation"
BEFORE UPDATE OR DELETE ON "inquiry_replies"
FOR EACH ROW EXECUTE FUNCTION "block_inquiry_reply_mutation"();

CREATE OR REPLACE FUNCTION "guard_inquiry_immutable_columns"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '문의는 삭제할 수 없습니다.';
  END IF;
  IF NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."content" IS DISTINCT FROM OLD."content"
     OR NEW."author_id" IS DISTINCT FROM OLD."author_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."class_id" IS DISTINCT FROM OLD."class_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION '문의 원문(제목·내용·작성자·유형·대상 반)은 수정할 수 없습니다.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_guard_inquiry_immutable_columns"
BEFORE UPDATE OR DELETE ON "inquiries"
FOR EACH ROW EXECUTE FUNCTION "guard_inquiry_immutable_columns"();

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32) — 각 쿼리는 0행을 반환해야 한다
-- ============================================================================
--   SELECT 1 WHERE to_regclass('idx_attendance_records_student_created_at') IS NULL;
--   SELECT 1 WHERE to_regclass('uq_class_sessions_active_replacement') IS NULL;
--   SELECT 2 - count(*) FROM pg_trigger
--    WHERE tgname IN ('trg_block_inquiry_reply_mutation', 'trg_guard_inquiry_immutable_columns');
--
--   -- 위반 시도가 거부되는가
--   UPDATE inquiry_replies SET content = content WHERE id = (SELECT id FROM inquiry_replies LIMIT 1);
--   -- ERROR: 문의 답글은 수정하거나 삭제할 수 없습니다.
--   UPDATE inquiries SET title = title || 'x' WHERE id = (SELECT id FROM inquiries LIMIT 1);
--   -- ERROR: 문의 원문(...)은 수정할 수 없습니다.

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
--   DROP TRIGGER IF EXISTS "trg_guard_inquiry_immutable_columns" ON "inquiries";
--   DROP FUNCTION IF EXISTS "guard_inquiry_immutable_columns"();
--   DROP TRIGGER IF EXISTS "trg_block_inquiry_reply_mutation" ON "inquiry_replies";
--   DROP FUNCTION IF EXISTS "block_inquiry_reply_mutation"();
--   DROP INDEX IF EXISTS "uq_class_sessions_active_replacement";
--   DROP INDEX IF EXISTS "idx_attendance_records_student_created_at";
