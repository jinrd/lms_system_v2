CREATE UNIQUE INDEX "uq_attendance_codes_active_session"
ON "attendance_codes" ("class_session_id")
WHERE "status" = 'ACTIVE'::"attendance_code_status";
