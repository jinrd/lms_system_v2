-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('STUDENT', 'INSTRUCTOR', 'MANAGER', 'PRINCIPAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE', 'DELETE_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "subject_mode" AS ENUM ('THEORY', 'PRACTICE', 'MIXED');

-- CreateEnum
CREATE TYPE "course_status" AS ENUM ('PLANNED', 'RECRUITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "class_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "enrollment_type" AS ENUM ('REGULAR', 'SUPPLEMENT', 'MAKEUP', 'RETAKE', 'AUDIT');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "session_kind" AS ENUM ('REGULAR', 'MAKEUP');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('UNPROCESSED', 'PRESENT', 'LATE', 'ABSENT', 'EARLY_LEAVE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "attendance_method" AS ENUM ('SYSTEM_AUTO', 'CODE', 'INSTRUCTOR_MANUAL', 'MANAGER_MANUAL', 'PRINCIPAL_MANUAL', 'ADMIN_MANUAL');

-- CreateEnum
CREATE TYPE "attendance_code_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "attendance_code_attempt_result" AS ENUM ('SUCCESS', 'INVALID', 'BLOCKED');

-- CreateEnum
CREATE TYPE "exam_scope" AS ENUM ('SUBJECT', 'COMPREHENSIVE');

-- CreateEnum
CREATE TYPE "exam_stage" AS ENUM ('REGULAR', 'MIDTERM', 'FINAL');

-- CreateEnum
CREATE TYPE "exam_part_type" AS ENUM ('WRITTEN', 'PRACTICAL');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER');

-- CreateEnum
CREATE TYPE "difficulty_level" AS ENUM ('EASY', 'NORMAL', 'HARD');

-- CreateEnum
CREATE TYPE "exam_status" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'GRADING', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('NOT_STARTED', 'NOT_ATTENDED', 'IN_PROGRESS', 'SUBMITTED', 'INCOMPLETE', 'GRADING', 'GRADED');

-- CreateEnum
CREATE TYPE "submission_method" AS ENUM ('MANUAL', 'AUTO_TIMEOUT', 'AUTO_PART_CLOSED');

-- CreateEnum
CREATE TYPE "pass_status" AS ENUM ('PENDING', 'PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "assignment_submission_status" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "notice_type" AS ENUM ('STUDENT', 'INSTRUCTOR');

-- CreateEnum
CREATE TYPE "notice_scope" AS ENUM ('ALL', 'CLASSES');

-- CreateEnum
CREATE TYPE "inquiry_type" AS ENUM ('CLASS', 'GENERAL');

-- CreateEnum
CREATE TYPE "inquiry_status" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('PENDING', 'ACTIVE', 'DELETE_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "audit_result" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "login_id" VARCHAR(100),
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255),
    "name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30),
    "birth_date" DATE,
    "gender" "gender",
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "temporary_password_expires_at" TIMESTAMPTZ(6),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "password_changed_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "deactivated_at" TIMESTAMPTZ(6),
    "scheduled_deletion_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "is_minor_at_signup" BOOLEAN NOT NULL,
    "guardian_name" VARCHAR(100),
    "guardian_phone" VARCHAR(30),
    "guardian_removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_status_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "previous_status" "user_status" NOT NULL,
    "new_status" "user_status" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_identifier_hash" CHAR(64) NOT NULL,
    "device_name" VARCHAR(150),
    "refresh_token_hash" CHAR(64) NOT NULL,
    "token_version" INTEGER NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "last_used_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_id" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "status" "attendance_code_status" NOT NULL,
    "generated_by" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "attendance_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_code_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_code_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "result" "attendance_code_attempt_result" NOT NULL,
    "ip_address" INET,
    "user_agent" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_code_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "enrollment_subject_id" UUID NOT NULL,
    "session_participant_id" UUID,
    "student_id" UUID NOT NULL,
    "status" "attendance_status" NOT NULL,
    "method" "attendance_method",
    "checked_at" TIMESTAMPTZ(6),
    "processed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_change_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "attendance_record_id" UUID NOT NULL,
    "previous_status" "attendance_status" NOT NULL,
    "new_status" "attendance_status" NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_change_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_offering_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "room" VARCHAR(100),
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "class_status" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_instructor_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "assigned_from" DATE NOT NULL,
    "assigned_to" DATE,
    "assigned_by" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_instructor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedule_patterns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "room" VARCHAR(100),
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_schedule_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "class_subject_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "schedule_pattern_id" UUID,
    "instructor_id" UUID NOT NULL,
    "kind" "session_kind" NOT NULL,
    "replacement_for_session_id" UUID,
    "title" VARCHAR(200),
    "lesson_content" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "room" VARCHAR(100),
    "status" "session_status" NOT NULL,
    "completed_minutes" INTEGER,
    "canceled_at" TIMESTAMPTZ(6),
    "canceled_by" UUID,
    "cancel_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subject_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_subject_id" UUID NOT NULL,
    "progress_percent" DECIMAL(5,2) NOT NULL,
    "completed_minutes" INTEGER NOT NULL,
    "last_session_id" UUID,
    "note" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_subject_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "notice_type" NOT NULL,
    "scope" "notice_scope" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "important" BOOLEAN NOT NULL,
    "published_from" TIMESTAMPTZ(6),
    "published_until" TIMESTAMPTZ(6),
    "author_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_class_targets" (
    "notice_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,

    CONSTRAINT "notice_class_targets_pkey" PRIMARY KEY ("notice_id","class_id")
);

-- CreateTable
CREATE TABLE "notice_files" (
    "notice_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "notice_files_pkey" PRIMARY KEY ("notice_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("notice_id","user_id")
);

-- CreateTable
CREATE TABLE "inquiries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "type" "inquiry_type" NOT NULL,
    "class_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "status" "inquiry_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_replies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inquiry_id" UUID NOT NULL,
    "author_id" UUID,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inquiry_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquiry_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inquiry_id" UUID NOT NULL,
    "reply_id" UUID,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "inquiry_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handovers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "from_instructor_id" UUID,
    "to_instructor_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "handovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_files" (
    "handover_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "handover_files_pkey" PRIMARY KEY ("handover_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "education_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "education_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "education_field_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "mode" "subject_mode" NOT NULL,
    "default_duration_minutes" INTEGER,
    "display_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "curriculum" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "course_status" NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_offering_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_offering_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "planned_start_date" DATE,
    "planned_end_date" DATE,
    "planned_minutes" INTEGER,
    "curriculum" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_offering_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "type" "enrollment_type" NOT NULL,
    "status" "enrollment_status" NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "reason" TEXT,
    "attendance_managed" BOOLEAN NOT NULL,
    "grade_managed" BOOLEAN NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "attendance_managed" BOOLEAN NOT NULL,
    "grade_managed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "enrollment_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "source_enrollment_id" UUID NOT NULL,
    "source_enrollment_subject_id" UUID NOT NULL,
    "type" "enrollment_type" NOT NULL,
    "reason" TEXT NOT NULL,
    "assigned_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "course_offering_id" UUID NOT NULL,
    "source_template_id" UUID,
    "source_exam_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "scope" "exam_scope" NOT NULL,
    "stage" "exam_stage" NOT NULL,
    "status" "exam_status" NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "target_locked_at" TIMESTAMPTZ(6),
    "target_locked_by" UUID,
    "canceled_at" TIMESTAMPTZ(6),
    "canceled_by" UUID,
    "cancel_reason" TEXT,
    "results_reviewed_at" TIMESTAMPTZ(6),
    "results_reviewed_by" UUID,
    "results_published_at" TIMESTAMPTZ(6),
    "results_published_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "exam_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("exam_id","course_offering_subject_id")
);

-- CreateTable
CREATE TABLE "exam_class_targets" (
    "exam_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,

    CONSTRAINT "exam_class_targets_pkey" PRIMARY KEY ("exam_id","class_id")
);

-- CreateTable
CREATE TABLE "exam_parts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "type" "exam_part_type" NOT NULL,
    "total_score" DECIMAL(6,2) NOT NULL,
    "pass_score" DECIMAL(6,2) NOT NULL,
    "opens_at" TIMESTAMPTZ(6) NOT NULL,
    "closes_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER,
    "min_files" SMALLINT,
    "max_files" SMALLINT,
    "max_file_size_bytes" BIGINT,
    "max_total_size_bytes" BIGINT,
    "instructions" TEXT,

    CONSTRAINT "exam_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "course_offering_subject_id" UUID NOT NULL,
    "source_question_id" UUID,
    "type" "question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "explanation" TEXT,
    "score" DECIMAL(6,2) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "normalization_version" VARCHAR(30),

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_question_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "exam_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_question_accepted_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_question_id" UUID NOT NULL,
    "answer_text" TEXT NOT NULL,
    "normalized_answer" TEXT NOT NULL,

    CONSTRAINT "exam_question_accepted_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_practical_criteria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_part_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(6,2) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "exam_practical_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "course_offering_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "written_score" DECIMAL(6,2),
    "practical_score" DECIMAL(6,2),
    "written_result" "pass_status" NOT NULL,
    "practical_result" "pass_status" NOT NULL,
    "final_result" "pass_status" NOT NULL,
    "graded_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_part_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "exam_attempt_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "status" "attempt_status" NOT NULL,
    "score" DECIMAL(6,2),
    "result" "pass_status" NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "deadline_at" TIMESTAMPTZ(6),
    "last_saved_at" TIMESTAMPTZ(6),
    "submitted_at" TIMESTAMPTZ(6),
    "submission_method" "submission_method",
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "version" INTEGER NOT NULL,

    CONSTRAINT "exam_part_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_attempt_question_orders" (
    "exam_part_submission_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "exam_attempt_question_orders_pkey" PRIMARY KEY ("exam_part_submission_id","exam_question_id")
);

-- CreateTable
CREATE TABLE "exam_attempt_option_orders" (
    "exam_part_submission_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "exam_question_option_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "exam_attempt_option_orders_pkey" PRIMARY KEY ("exam_part_submission_id","exam_question_option_id")
);

-- CreateTable
CREATE TABLE "exam_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_part_submission_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "subjective_text" TEXT,
    "normalized_text" TEXT,
    "is_correct" BOOLEAN,
    "awarded_score" DECIMAL(6,2),
    "saved_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL,

    CONSTRAINT "exam_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_answer_selected_options" (
    "exam_answer_id" UUID NOT NULL,
    "exam_question_id" UUID NOT NULL,
    "exam_question_option_id" UUID NOT NULL,

    CONSTRAINT "exam_answer_selected_options_pkey" PRIMARY KEY ("exam_answer_id","exam_question_option_id")
);

-- CreateTable
CREATE TABLE "practical_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_part_submission_id" UUID NOT NULL,
    "exam_part_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "comment" TEXT,
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "practical_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_result_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_attempt_id" UUID NOT NULL,
    "previous_result" JSONB NOT NULL,
    "new_result" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_result_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_provider" VARCHAR(50) NOT NULL,
    "bucket" VARCHAR(150) NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "width" INTEGER,
    "height" INTEGER,
    "preview_object_key" VARCHAR(500),
    "preview_mime_type" VARCHAR(100),
    "preview_size_bytes" BIGINT,
    "status" "file_status" NOT NULL,
    "uploaded_by" UUID,
    "uploaded_by_role" "user_role",
    "delete_after" TIMESTAMPTZ(6),
    "delete_requested_at" TIMESTAMPTZ(6),
    "delete_reason" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "file_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practical_submission_files" (
    "exam_part_submission_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "display_order" SMALLINT NOT NULL,

    CONSTRAINT "practical_submission_files_pkey" PRIMARY KEY ("exam_part_submission_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "class_subject_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "opens_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "max_score" DECIMAL(6,2),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "current_version_id" UUID,
    "status" "assignment_submission_status" NOT NULL,
    "score" DECIMAL(6,2),
    "feedback" TEXT,
    "graded_by" UUID,
    "graded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submission_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_submission_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content" TEXT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submission_files" (
    "assignment_submission_version_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,
    "display_order" SMALLINT NOT NULL,

    CONSTRAINT "assignment_submission_files_pkey" PRIMARY KEY ("assignment_submission_version_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "learning_materials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "class_subject_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "visible_from" TIMESTAMPTZ(6),
    "active" BOOLEAN NOT NULL,
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "learning_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_material_files" (
    "learning_material_id" UUID NOT NULL,
    "file_asset_id" UUID NOT NULL,

    CONSTRAINT "learning_material_files_pkey" PRIMARY KEY ("learning_material_id","file_asset_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_id" UUID,
    "actor_role" "user_role",
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(100),
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "request_id" UUID,
    "result" "audit_result" NOT NULL,
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "level" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "error_code" VARCHAR(100),
    "stack" TEXT,
    "user_id" UUID,
    "route" VARCHAR(300),
    "request_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL,
    "storage_key" VARCHAR(500),
    "size_bytes" BIGINT,
    "checksum" VARCHAR(128),
    "retention_until" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "restore_tested_at" TIMESTAMPTZ(6),
    "restore_test_result" VARCHAR(30),

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_lifecycle_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "job_type" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL,
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_cursor" VARCHAR(200),
    "error_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_lifecycle_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "question_bank" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_id" UUID NOT NULL,
    "type" "question_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "explanation" TEXT,
    "default_score" DECIMAL(6,2) NOT NULL,
    "difficulty" "difficulty_level" NOT NULL,
    "active" BOOLEAN NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_accepted_answers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question_id" UUID NOT NULL,
    "answer_text" TEXT NOT NULL,
    "normalized_answer" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "question_accepted_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "scope" "exam_scope" NOT NULL,
    "stage" "exam_stage" NOT NULL,
    "default_open_days" INTEGER,
    "active" BOOLEAN NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_template_subjects" (
    "exam_template_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,

    CONSTRAINT "exam_template_subjects_pkey" PRIMARY KEY ("exam_template_id","subject_id")
);

-- CreateTable
CREATE TABLE "exam_template_parts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_template_id" UUID NOT NULL,
    "type" "exam_part_type" NOT NULL,
    "total_score" DECIMAL(6,2) NOT NULL,
    "pass_score" DECIMAL(6,2) NOT NULL,
    "duration_minutes" INTEGER,
    "default_open_offset_days" INTEGER NOT NULL,
    "default_open_days" INTEGER NOT NULL,
    "min_files" SMALLINT,
    "max_files" SMALLINT,
    "max_file_size_bytes" BIGINT,
    "max_total_size_bytes" BIGINT,
    "instructions" TEXT,

    CONSTRAINT "exam_template_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_template_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_template_part_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,

    CONSTRAINT "exam_template_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_template_practical_criteria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_template_part_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(6,2) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "exam_template_practical_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" VARCHAR(50) NOT NULL,
    "version" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "terms_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "terms_document_id" UUID NOT NULL,
    "agreed" BOOLEAN NOT NULL,
    "agreed_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" INET,

    CONSTRAINT "terms_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_users_login_id" ON "users"("login_id");

-- CreateIndex
CREATE INDEX "idx_users_role_status" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "idx_users_name" ON "users"("name");

-- CreateIndex
CREATE INDEX "idx_users_phone" ON "users"("phone");

-- CreateIndex
CREATE INDEX "idx_user_status_histories_user_changed_at" ON "user_status_histories"("user_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_auth_sessions_user_active" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "idx_auth_sessions_refresh_token_hash" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uq_auth_sessions_user_device" ON "auth_sessions"("user_id", "device_identifier_hash");

-- CreateIndex
CREATE INDEX "attendance_codes_class_session_id_status_idx" ON "attendance_codes"("class_session_id", "status");

-- CreateIndex
CREATE INDEX "attendance_code_attempts_attendance_code_id_student_id_resu_idx" ON "attendance_code_attempts"("attendance_code_id", "student_id", "result", "attempted_at");

-- CreateIndex
CREATE INDEX "attendance_code_attempts_ip_address_attempted_at_idx" ON "attendance_code_attempts"("ip_address", "attempted_at");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_class_session_id_idx" ON "attendance_records"("student_id", "class_session_id");

-- CreateIndex
CREATE INDEX "attendance_records_class_session_id_status_idx" ON "attendance_records"("class_session_id", "status");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_status_idx" ON "attendance_records"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_class_session_id_student_id_key" ON "attendance_records"("class_session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_change_histories_attendance_record_id_changed_at_idx" ON "attendance_change_histories"("attendance_record_id", "changed_at");

-- CreateIndex
CREATE INDEX "idx_classes_offering_status" ON "classes"("course_offering_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_classes_offering_name" ON "classes"("course_offering_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_classes_id_offering" ON "classes"("id", "course_offering_id");

-- CreateIndex
CREATE INDEX "idx_class_subjects_course_offering" ON "class_subjects"("course_offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_subjects_class_offering_subject" ON "class_subjects"("class_id", "course_offering_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_subjects_id_class" ON "class_subjects"("id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_subjects_id_offering_subject" ON "class_subjects"("id", "course_offering_subject_id");

-- CreateIndex
CREATE INDEX "idx_class_instructor_assignments_class_from" ON "class_instructor_assignments"("class_id", "assigned_from");

-- CreateIndex
CREATE INDEX "idx_class_instructor_assignments_instructor_to" ON "class_instructor_assignments"("instructor_id", "assigned_to");

-- CreateIndex
CREATE INDEX "idx_class_schedule_patterns_class_day" ON "class_schedule_patterns"("class_id", "active", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_schedule_patterns_identity" ON "class_schedule_patterns"("id", "class_id", "class_subject_id");

-- CreateIndex
CREATE INDEX "idx_class_sessions_class_starts_at" ON "class_sessions"("class_id", "starts_at");

-- CreateIndex
CREATE INDEX "idx_class_sessions_subject_starts_at" ON "class_sessions"("class_subject_id", "starts_at");

-- CreateIndex
CREATE INDEX "idx_class_sessions_instructor_starts_at" ON "class_sessions"("instructor_id", "starts_at");

-- CreateIndex
CREATE INDEX "idx_class_sessions_status_starts_at" ON "class_sessions"("status", "starts_at");

-- CreateIndex
CREATE INDEX "idx_class_sessions_replacement_status" ON "class_sessions"("replacement_for_session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_sessions_id_class_subject" ON "class_sessions"("id", "class_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_sessions_id_offering_subject" ON "class_sessions"("id", "course_offering_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_sessions_identity" ON "class_sessions"("id", "class_id", "class_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_class_subject_progress_subject" ON "class_subject_progress"("class_subject_id");

-- CreateIndex
CREATE INDEX "notices_type_scope_published_from_published_until_idx" ON "notices"("type", "scope", "published_from", "published_until");

-- CreateIndex
CREATE INDEX "notice_reads_user_id_read_at_idx" ON "notice_reads"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "inquiries_status_created_at_idx" ON "inquiries"("status", "created_at");

-- CreateIndex
CREATE INDEX "handovers_class_id_created_at_idx" ON "handovers"("class_id", "created_at");

-- CreateIndex
CREATE INDEX "handovers_to_instructor_id_acknowledged_at_idx" ON "handovers"("to_instructor_id", "acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_education_fields_name" ON "education_fields"("name");

-- CreateIndex
CREATE INDEX "idx_subjects_field_active_order" ON "subjects"("education_field_id", "active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_subjects_field_name" ON "subjects"("education_field_id", "name");

-- CreateIndex
CREATE INDEX "idx_course_offerings_status_dates" ON "course_offerings"("status", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_course_offering_subjects_subject" ON "course_offering_subjects"("course_offering_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_course_offering_subjects_sequence" ON "course_offering_subjects"("course_offering_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "uq_course_offering_subjects_id_offering" ON "course_offering_subjects"("id", "course_offering_id");

-- CreateIndex
CREATE INDEX "idx_enrollments_student_status" ON "enrollments"("student_id", "status");

-- CreateIndex
CREATE INDEX "idx_enrollments_class_status" ON "enrollments"("class_id", "status");

-- CreateIndex
CREATE INDEX "idx_enrollments_class_type" ON "enrollments"("class_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollments_id_student" ON "enrollments"("id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollments_id_offering" ON "enrollments"("id", "course_offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollments_id_student_class" ON "enrollments"("id", "student_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollments_identity" ON "enrollments"("id", "student_id", "class_id", "course_offering_id");

-- CreateIndex
CREATE INDEX "idx_enrollment_subjects_offering_subject" ON "enrollment_subjects"("course_offering_subject_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "idx_enrollment_subjects_offering" ON "enrollment_subjects"("course_offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollment_subjects_enrollment_subject" ON "enrollment_subjects"("enrollment_id", "course_offering_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_enrollment_subjects_identity" ON "enrollment_subjects"("id", "enrollment_id", "course_offering_subject_id");

-- CreateIndex
CREATE INDEX "idx_session_participants_student_session" ON "session_participants"("student_id", "class_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_session_participants_session_student" ON "session_participants"("class_session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_session_participants_identity" ON "session_participants"("id", "class_session_id", "student_id", "source_enrollment_id", "source_enrollment_subject_id");

-- CreateIndex
CREATE INDEX "exams_course_offering_id_status_idx" ON "exams"("course_offering_id", "status");

-- CreateIndex
CREATE INDEX "exams_status_opens_at_closes_at_idx" ON "exams"("status", "opens_at", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "exams_id_course_offering_id_key" ON "exams"("id", "course_offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_parts_exam_id_type_key" ON "exam_parts"("exam_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "exam_parts_id_exam_id_key" ON "exam_parts"("id", "exam_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_exam_part_id_display_order_key" ON "exam_questions"("exam_part_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_id_exam_part_id_key" ON "exam_questions"("id", "exam_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_options_exam_question_id_display_order_key" ON "exam_question_options"("exam_question_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_options_id_exam_question_id_key" ON "exam_question_options"("id", "exam_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_question_accepted_answers_exam_question_id_normalized__key" ON "exam_question_accepted_answers"("exam_question_id", "normalized_answer");

-- CreateIndex
CREATE UNIQUE INDEX "exam_practical_criteria_exam_part_id_display_order_key" ON "exam_practical_criteria"("exam_part_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_practical_criteria_id_exam_part_id_key" ON "exam_practical_criteria"("id", "exam_part_id");

-- CreateIndex
CREATE INDEX "exam_attempts_student_id_status_idx" ON "exam_attempts"("student_id", "status");

-- CreateIndex
CREATE INDEX "exam_attempts_exam_id_status_idx" ON "exam_attempts"("exam_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_exam_id_student_id_key" ON "exam_attempts"("exam_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempts_id_exam_id_key" ON "exam_attempts"("id", "exam_id");

-- CreateIndex
CREATE INDEX "exam_part_submissions_status_deadline_at_idx" ON "exam_part_submissions"("status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "exam_part_submissions_exam_attempt_id_exam_part_id_key" ON "exam_part_submissions"("exam_attempt_id", "exam_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_part_submissions_id_exam_part_id_key" ON "exam_part_submissions"("id", "exam_part_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempt_question_orders_exam_part_submission_id_displa_key" ON "exam_attempt_question_orders"("exam_part_submission_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_attempt_option_orders_exam_part_submission_id_exam_que_key" ON "exam_attempt_option_orders"("exam_part_submission_id", "exam_question_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_exam_part_submission_id_exam_question_id_key" ON "exam_answers"("exam_part_submission_id", "exam_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_answers_id_exam_question_id_key" ON "exam_answers"("id", "exam_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "practical_scores_exam_part_submission_id_criterion_id_key" ON "practical_scores"("exam_part_submission_id", "criterion_id");

-- CreateIndex
CREATE INDEX "exam_result_revisions_exam_attempt_id_changed_at_idx" ON "exam_result_revisions"("exam_attempt_id", "changed_at");

-- CreateIndex
CREATE INDEX "file_assets_status_delete_after_idx" ON "file_assets"("status", "delete_after");

-- CreateIndex
CREATE INDEX "file_assets_status_created_at_idx" ON "file_assets"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "file_assets_storage_provider_bucket_object_key_key" ON "file_assets"("storage_provider", "bucket", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "practical_submission_files_exam_part_submission_id_display__key" ON "practical_submission_files"("exam_part_submission_id", "display_order");

-- CreateIndex
CREATE INDEX "assignments_class_id_due_at_idx" ON "assignments"("class_id", "due_at");

-- CreateIndex
CREATE INDEX "assignments_class_subject_id_due_at_idx" ON "assignments"("class_subject_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_id_class_id_key" ON "assignments"("id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_versions_assignment_submission_id_ver_key" ON "assignment_submission_versions"("assignment_submission_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_versions_id_assignment_submission_id_key" ON "assignment_submission_versions"("id", "assignment_submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submission_files_assignment_submission_version_i_key" ON "assignment_submission_files"("assignment_submission_version_id", "display_order");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_created_at_idx" ON "audit_logs"("resource_type", "resource_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");

-- CreateIndex
CREATE INDEX "system_logs_level_created_at_idx" ON "system_logs"("level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "system_logs_request_id_idx" ON "system_logs"("request_id");

-- CreateIndex
CREATE INDEX "data_lifecycle_runs_job_type_started_at_idx" ON "data_lifecycle_runs"("job_type", "started_at" DESC);

-- CreateIndex
CREATE INDEX "data_lifecycle_runs_status_started_at_idx" ON "data_lifecycle_runs"("status", "started_at");

-- CreateIndex
CREATE INDEX "question_bank_subject_id_type_difficulty_active_idx" ON "question_bank"("subject_id", "type", "difficulty", "active");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_display_order_key" ON "question_options"("question_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "question_accepted_answers_question_id_normalized_answer_key" ON "question_accepted_answers"("question_id", "normalized_answer");

-- CreateIndex
CREATE UNIQUE INDEX "exam_template_parts_exam_template_id_type_key" ON "exam_template_parts"("exam_template_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "exam_template_questions_exam_template_part_id_question_id_key" ON "exam_template_questions"("exam_template_part_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_template_questions_exam_template_part_id_display_order_key" ON "exam_template_questions"("exam_template_part_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "exam_template_practical_criteria_exam_template_part_id_disp_key" ON "exam_template_practical_criteria"("exam_template_part_id", "display_order");

-- CreateIndex
CREATE INDEX "idx_terms_documents_active_effective_at" ON "terms_documents"("active", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_terms_documents_type_version" ON "terms_documents"("type", "version");

-- CreateIndex
CREATE INDEX "idx_terms_consents_document" ON "terms_consents"("terms_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_terms_consents_user_document" ON "terms_consents"("user_id", "terms_document_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_histories" ADD CONSTRAINT "user_status_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_status_histories" ADD CONSTRAINT "user_status_histories_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_codes" ADD CONSTRAINT "attendance_codes_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_codes" ADD CONSTRAINT "attendance_codes_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_code_attempts" ADD CONSTRAINT "attendance_code_attempts_attendance_code_id_fkey" FOREIGN KEY ("attendance_code_id") REFERENCES "attendance_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_code_attempts" ADD CONSTRAINT "attendance_code_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_subject_id_fkey" FOREIGN KEY ("enrollment_subject_id") REFERENCES "enrollment_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_participant_id_fkey" FOREIGN KEY ("session_participant_id") REFERENCES "session_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_change_histories" ADD CONSTRAINT "attendance_change_histories_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_change_histories" ADD CONSTRAINT "attendance_change_histories_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instructor_assignments" ADD CONSTRAINT "class_instructor_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instructor_assignments" ADD CONSTRAINT "class_instructor_assignments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_instructor_assignments" ADD CONSTRAINT "class_instructor_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_patterns" ADD CONSTRAINT "class_schedule_patterns_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedule_patterns" ADD CONSTRAINT "class_schedule_patterns_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_schedule_pattern_id_fkey" FOREIGN KEY ("schedule_pattern_id") REFERENCES "class_schedule_patterns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_canceled_by_fkey" FOREIGN KEY ("canceled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_replacement_for_session_id_fkey" FOREIGN KEY ("replacement_for_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subject_progress" ADD CONSTRAINT "class_subject_progress_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subject_progress" ADD CONSTRAINT "class_subject_progress_last_session_id_fkey" FOREIGN KEY ("last_session_id") REFERENCES "class_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subject_progress" ADD CONSTRAINT "class_subject_progress_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_class_targets" ADD CONSTRAINT "notice_class_targets_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_class_targets" ADD CONSTRAINT "notice_class_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_files" ADD CONSTRAINT "notice_files_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_files" ADD CONSTRAINT "notice_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_files" ADD CONSTRAINT "inquiry_files_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_files" ADD CONSTRAINT "inquiry_files_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "inquiry_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiry_files" ADD CONSTRAINT "inquiry_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_from_instructor_id_fkey" FOREIGN KEY ("from_instructor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_to_instructor_id_fkey" FOREIGN KEY ("to_instructor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handovers" ADD CONSTRAINT "handovers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_files" ADD CONSTRAINT "handover_files_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "handovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_files" ADD CONSTRAINT "handover_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_education_field_id_fkey" FOREIGN KEY ("education_field_id") REFERENCES "education_fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offering_subjects" ADD CONSTRAINT "course_offering_subjects_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offering_subjects" ADD CONSTRAINT "course_offering_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_subjects" ADD CONSTRAINT "enrollment_subjects_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_subjects" ADD CONSTRAINT "enrollment_subjects_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_class_session_id_fkey" FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_source_enrollment_id_fkey" FOREIGN KEY ("source_enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_source_enrollment_subject_id_fkey" FOREIGN KEY ("source_enrollment_subject_id") REFERENCES "enrollment_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "exam_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_source_exam_id_fkey" FOREIGN KEY ("source_exam_id") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_target_locked_by_fkey" FOREIGN KEY ("target_locked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_canceled_by_fkey" FOREIGN KEY ("canceled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_results_reviewed_by_fkey" FOREIGN KEY ("results_reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_results_published_by_fkey" FOREIGN KEY ("results_published_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_class_targets" ADD CONSTRAINT "exam_class_targets_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_class_targets" ADD CONSTRAINT "exam_class_targets_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_class_targets" ADD CONSTRAINT "exam_class_targets_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_parts" ADD CONSTRAINT "exam_parts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_course_offering_subject_id_fkey" FOREIGN KEY ("course_offering_subject_id") REFERENCES "course_offering_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "question_bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_options" ADD CONSTRAINT "exam_question_options_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_question_accepted_answers" ADD CONSTRAINT "exam_question_accepted_answers_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_practical_criteria" ADD CONSTRAINT "exam_practical_criteria_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_course_offering_id_fkey" FOREIGN KEY ("course_offering_id") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_part_submissions" ADD CONSTRAINT "exam_part_submissions_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_part_submissions" ADD CONSTRAINT "exam_part_submissions_exam_attempt_id_fkey" FOREIGN KEY ("exam_attempt_id") REFERENCES "exam_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_part_submissions" ADD CONSTRAINT "exam_part_submissions_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_part_submissions" ADD CONSTRAINT "exam_part_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_question_orders" ADD CONSTRAINT "exam_attempt_question_orders_exam_part_submission_id_fkey" FOREIGN KEY ("exam_part_submission_id") REFERENCES "exam_part_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_question_orders" ADD CONSTRAINT "exam_attempt_question_orders_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_question_orders" ADD CONSTRAINT "exam_attempt_question_orders_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_option_orders" ADD CONSTRAINT "exam_attempt_option_orders_exam_part_submission_id_fkey" FOREIGN KEY ("exam_part_submission_id") REFERENCES "exam_part_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_option_orders" ADD CONSTRAINT "exam_attempt_option_orders_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_option_orders" ADD CONSTRAINT "exam_attempt_option_orders_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_attempt_option_orders" ADD CONSTRAINT "exam_attempt_option_orders_exam_question_option_id_fkey" FOREIGN KEY ("exam_question_option_id") REFERENCES "exam_question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_exam_part_submission_id_fkey" FOREIGN KEY ("exam_part_submission_id") REFERENCES "exam_part_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answer_selected_options" ADD CONSTRAINT "exam_answer_selected_options_exam_answer_id_fkey" FOREIGN KEY ("exam_answer_id") REFERENCES "exam_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answer_selected_options" ADD CONSTRAINT "exam_answer_selected_options_exam_question_id_fkey" FOREIGN KEY ("exam_question_id") REFERENCES "exam_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_answer_selected_options" ADD CONSTRAINT "exam_answer_selected_options_exam_question_option_id_fkey" FOREIGN KEY ("exam_question_option_id") REFERENCES "exam_question_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_scores" ADD CONSTRAINT "practical_scores_exam_part_submission_id_fkey" FOREIGN KEY ("exam_part_submission_id") REFERENCES "exam_part_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_scores" ADD CONSTRAINT "practical_scores_exam_part_id_fkey" FOREIGN KEY ("exam_part_id") REFERENCES "exam_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_scores" ADD CONSTRAINT "practical_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "exam_practical_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_scores" ADD CONSTRAINT "practical_scores_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_revisions" ADD CONSTRAINT "exam_result_revisions_exam_attempt_id_fkey" FOREIGN KEY ("exam_attempt_id") REFERENCES "exam_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_result_revisions" ADD CONSTRAINT "exam_result_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_submission_files" ADD CONSTRAINT "practical_submission_files_exam_part_submission_id_fkey" FOREIGN KEY ("exam_part_submission_id") REFERENCES "exam_part_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practical_submission_files" ADD CONSTRAINT "practical_submission_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "assignment_submission_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_graded_by_fkey" FOREIGN KEY ("graded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submission_versions" ADD CONSTRAINT "assignment_submission_versions_assignment_submission_id_fkey" FOREIGN KEY ("assignment_submission_id") REFERENCES "assignment_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submission_files" ADD CONSTRAINT "assignment_submission_files_assignment_submission_version__fkey" FOREIGN KEY ("assignment_submission_version_id") REFERENCES "assignment_submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submission_files" ADD CONSTRAINT "assignment_submission_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_class_subject_id_fkey" FOREIGN KEY ("class_subject_id") REFERENCES "class_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_material_files" ADD CONSTRAINT "learning_material_files_learning_material_id_fkey" FOREIGN KEY ("learning_material_id") REFERENCES "learning_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_material_files" ADD CONSTRAINT "learning_material_files_file_asset_id_fkey" FOREIGN KEY ("file_asset_id") REFERENCES "file_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_accepted_answers" ADD CONSTRAINT "question_accepted_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_templates" ADD CONSTRAINT "exam_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_subjects" ADD CONSTRAINT "exam_template_subjects_exam_template_id_fkey" FOREIGN KEY ("exam_template_id") REFERENCES "exam_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_subjects" ADD CONSTRAINT "exam_template_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_parts" ADD CONSTRAINT "exam_template_parts_exam_template_id_fkey" FOREIGN KEY ("exam_template_id") REFERENCES "exam_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_questions" ADD CONSTRAINT "exam_template_questions_exam_template_part_id_fkey" FOREIGN KEY ("exam_template_part_id") REFERENCES "exam_template_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_questions" ADD CONSTRAINT "exam_template_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_template_practical_criteria" ADD CONSTRAINT "exam_template_practical_criteria_exam_template_part_id_fkey" FOREIGN KEY ("exam_template_part_id") REFERENCES "exam_template_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_consents" ADD CONSTRAINT "terms_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_consents" ADD CONSTRAINT "terms_consents_terms_document_id_fkey" FOREIGN KEY ("terms_document_id") REFERENCES "terms_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
