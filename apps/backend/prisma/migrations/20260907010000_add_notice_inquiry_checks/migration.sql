-- 공지·문의 테이블에 유형별 배타 조건과 값 범위 CHECK 제약을 추가한다.
--
-- init 마이그레이션은 notices·inquiries·inquiry_replies 에 CHECK 제약을 하나도
-- 만들지 않았다. 기획안 §18.1·§19.1이 요구하는 유형별 배타 조건이 DB에 없어,
-- 서비스 검증이 누락되면 그대로 잘못된 행이 저장된다. 애플리케이션 계층이 먼저
-- 이해 가능한 오류를 내고 이 제약은 최종 방어선으로 쓴다(기획안 §32).

-- ============================================================================
-- notices
-- ============================================================================
ALTER TABLE "notices"
  ADD CONSTRAINT "chk_notices_text_not_blank"
  CHECK (btrim("title") <> '' AND btrim("content") <> '');

-- 강사 공지(type = INSTRUCTOR)는 전체 범위만 허용한다(§18.1).
ALTER TABLE "notices"
  ADD CONSTRAINT "chk_notices_instructor_scope_all"
  CHECK (
    "type" <> 'INSTRUCTOR'::"notice_type"
    OR "scope" = 'ALL'::"notice_scope"
  );

-- 게시 시작·종료 시각이 둘 다 있으면 시작이 종료보다 뒤일 수 없다.
ALTER TABLE "notices"
  ADD CONSTRAINT "chk_notices_publish_window"
  CHECK (
    "published_from" IS NULL
    OR "published_until" IS NULL
    OR "published_from" <= "published_until"
  );

-- ============================================================================
-- inquiries
-- ============================================================================
ALTER TABLE "inquiries"
  ADD CONSTRAINT "chk_inquiries_text_not_blank"
  CHECK (btrim("title") <> '' AND btrim("content") <> '');

-- 반 관련 문의는 대상 반이 있어야 하고, 일반 문의는 없어야 한다(§19.1).
ALTER TABLE "inquiries"
  ADD CONSTRAINT "chk_inquiries_class_id_by_type"
  CHECK (
    ("type" = 'CLASS'::"inquiry_type" AND "class_id" IS NOT NULL)
    OR ("type" = 'GENERAL'::"inquiry_type" AND "class_id" IS NULL)
  );

-- 종료 상태 ↔ 종료 시각.
ALTER TABLE "inquiries"
  ADD CONSTRAINT "chk_inquiries_closed_at"
  CHECK (
    ("status" = 'CLOSED'::"inquiry_status" AND "closed_at" IS NOT NULL)
    OR ("status" <> 'CLOSED'::"inquiry_status" AND "closed_at" IS NULL)
  );

-- ============================================================================
-- inquiry_replies
-- ============================================================================
ALTER TABLE "inquiry_replies"
  ADD CONSTRAINT "chk_inquiry_replies_content_not_blank"
  CHECK (btrim("content") <> '');

-- ============================================================================
-- 적용 검증 쿼리 (기획안 §32)
-- ============================================================================
--   SELECT conrelid::regclass::text AS table_name, conname
--     FROM pg_constraint
--    WHERE contype = 'c'
--      AND conname LIKE 'chk_%'
--      AND conrelid::regclass::text IN ('notices', 'inquiries', 'inquiry_replies')
--    ORDER BY 1, 2;
--   -- 기대: 6행
--
-- 위반 INSERT가 거부되는지 확인(각 1건):
--   -- 강사 공지에 scope = CLASSES
--   INSERT INTO notices (type, scope, title, content, important, updated_at)
--   VALUES ('INSTRUCTOR', 'CLASSES', '제목', '내용', false, now());
--   -- ERROR: chk_notices_instructor_scope_all
--
--   -- 일반 문의에 class_id
--   INSERT INTO inquiries (author_id, type, class_id, title, content, status, updated_at)
--   SELECT id, 'GENERAL', (SELECT id FROM classes LIMIT 1), '제목', '내용', 'RECEIVED', now()
--     FROM users WHERE role = 'STUDENT' LIMIT 1;
--   -- ERROR: chk_inquiries_class_id_by_type

-- ============================================================================
-- 롤백 절차 (기획안 §32)
-- ============================================================================
--   ALTER TABLE "notices"          DROP CONSTRAINT "chk_notices_text_not_blank";
--   ALTER TABLE "notices"          DROP CONSTRAINT "chk_notices_instructor_scope_all";
--   ALTER TABLE "notices"          DROP CONSTRAINT "chk_notices_publish_window";
--   ALTER TABLE "inquiries"        DROP CONSTRAINT "chk_inquiries_text_not_blank";
--   ALTER TABLE "inquiries"        DROP CONSTRAINT "chk_inquiries_class_id_by_type";
--   ALTER TABLE "inquiries"        DROP CONSTRAINT "chk_inquiries_closed_at";
--   ALTER TABLE "inquiry_replies"  DROP CONSTRAINT "chk_inquiry_replies_content_not_blank";
