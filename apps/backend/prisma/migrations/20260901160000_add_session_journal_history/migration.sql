-- 수업 일지의 작성자와 변경 이력을 보존한다.
-- 개편안: "작성자, 작성 시각, 수정 시각과 변경 이력을 보존한다."

-- 1. 수업에 일지 작성자와 마지막 수정 정보를 둔다.
ALTER TABLE "class_sessions"
  ADD COLUMN "journal_written_by" UUID,
  ADD COLUMN "journal_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "journal_updated_by" UUID;

ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_journal_written_by_fkey"
  FOREIGN KEY ("journal_written_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "class_sessions"
  ADD CONSTRAINT "class_sessions_journal_updated_by_fkey"
  FOREIGN KEY ("journal_updated_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. 일지 변경 이력. 작성과 수정 모두 한 건씩 남긴다.
CREATE TABLE "class_session_journal_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_id" UUID NOT NULL,
    "previous_title" VARCHAR(200),
    "previous_lesson_content" TEXT,
    "new_title" VARCHAR(200) NOT NULL,
    "new_lesson_content" TEXT NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_session_journal_histories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_class_session_journal_histories_session"
ON "class_session_journal_histories"("class_session_id", "changed_at");

ALTER TABLE "class_session_journal_histories"
  ADD CONSTRAINT "class_session_journal_histories_class_session_id_fkey"
  FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_session_journal_histories"
  ADD CONSTRAINT "class_session_journal_histories_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
