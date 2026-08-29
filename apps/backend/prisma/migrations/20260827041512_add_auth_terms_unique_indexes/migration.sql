-- This is an empty migration.
CREATE UNIQUE INDEX "uq_users_active_login_id"
ON "users" (lower("login_id"))
WHERE "status" <> 'DELETED'::"user_status";

CREATE UNIQUE INDEX "uq_terms_documents_active_type"
ON "terms_documents" ("type")
WHERE "active" = true;