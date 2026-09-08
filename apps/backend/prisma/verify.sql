-- 스키마 무결선(§24 유니크, §25 인덱스, §32 트리거·제약) 검증 스크립트.
--
-- 사용법:  psql "$DATABASE_URL_WITHOUT_PRISMA_PARAMS" -f prisma/verify.sql
-- 기대:    "check_name" 컬럼이 한 줄도 나오지 않는다. 한 줄이라도 나오면
--          그 이름의 제약이 빠졌거나 데이터가 규칙을 위반하고 있다는 뜻이다.
--
-- Prisma 스키마만으로 표현되지 않는 항목(부분 유니크, 트리거, exclusion
-- constraint)을 확정적으로 확인한다. 일반 유니크·FK·enum·기본 인덱스는 Prisma
-- 마이그레이션이 보장하므로 여기서는 다루지 않는다(기획안 §32).

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- §24 부분 유니크 인덱스
-- ---------------------------------------------------------------------------
SELECT check_name FROM (
  SELECT 'uq_users_active_login_id (§24)'                        AS check_name WHERE to_regclass('public.uq_users_active_login_id') IS NULL
  UNION ALL SELECT 'uq_terms_documents_active_type (§24)'                       WHERE to_regclass('public.uq_terms_documents_active_type') IS NULL
  UNION ALL SELECT 'uq_classes_active_name (§24)'                              WHERE to_regclass('public.uq_classes_active_name') IS NULL
  UNION ALL SELECT 'uq_class_current_instructor (§24)'                         WHERE to_regclass('public.uq_class_current_instructor') IS NULL
  UNION ALL SELECT 'uq_attendance_codes_active_session (§24)'                  WHERE to_regclass('public.uq_attendance_codes_active_session') IS NULL
  UNION ALL SELECT 'uq_enrollments_active_student_class_offering_type (§24)'   WHERE to_regclass('public.uq_enrollments_active_student_class_offering_type') IS NULL
  UNION ALL SELECT 'uq_enrollments_active_regular_student_offering (§24)'      WHERE to_regclass('public.uq_enrollments_active_regular_student_offering') IS NULL
  UNION ALL SELECT 'uq_class_sessions_active_replacement (§32)'                WHERE to_regclass('public.uq_class_sessions_active_replacement') IS NULL
) missing;

-- ---------------------------------------------------------------------------
-- §24 일반 유니크 (PK·복합 유니크로 충족되는 항목의 존재 확인)
-- ---------------------------------------------------------------------------
SELECT check_name FROM (
  SELECT 'education_fields.name unique (§24)'                     AS check_name WHERE to_regclass('public.uq_education_fields_name') IS NULL
  UNION ALL SELECT 'subjects(field,name) unique (§24)'                         WHERE to_regclass('public.uq_subjects_field_name') IS NULL
  UNION ALL SELECT 'course_offering_subjects(offering,subject) unique (§24)'   WHERE to_regclass('public.uq_course_offering_subjects_subject') IS NULL
  UNION ALL SELECT 'class_programs(class,offering) unique (§24)'               WHERE to_regclass('public.uq_class_programs_class_course') IS NULL
  UNION ALL SELECT 'class_subjects(class,offering_subject) unique (§24)'       WHERE to_regclass('public.uq_class_subjects_class_offering_subject') IS NULL
  UNION ALL SELECT 'enrollment_subjects(enrollment,offering_subject) uq (§24)' WHERE to_regclass('public.uq_enrollment_subjects_enrollment_subject') IS NULL
  UNION ALL SELECT 'session_participants(session,student) unique (§24)'        WHERE to_regclass('public.uq_session_participants_session_student') IS NULL
  UNION ALL SELECT 'attendance_records(session,student) unique (§24)'          WHERE to_regclass('public.attendance_records_class_session_id_student_id_key') IS NULL
  UNION ALL SELECT 'exam_template_parts(template,type) unique (§24)'           WHERE to_regclass('public.exam_template_parts_exam_template_id_type_key') IS NULL
  UNION ALL SELECT 'exam_parts(exam,type) unique (§24)'                        WHERE to_regclass('public.exam_parts_exam_id_type_key') IS NULL
  UNION ALL SELECT 'exam_attempts(exam,student) unique (§24)'                  WHERE to_regclass('public.exam_attempts_exam_id_student_id_key') IS NULL
  UNION ALL SELECT 'exam_part_submissions(attempt,part) unique (§24)'          WHERE to_regclass('public.exam_part_submissions_exam_attempt_id_exam_part_id_key') IS NULL
  UNION ALL SELECT 'exam_answers(submission,question) unique (§24)'            WHERE to_regclass('public.exam_answers_exam_part_submission_id_exam_question_id_key') IS NULL
  UNION ALL SELECT 'practical_scores(submission,criterion) unique (§24)'       WHERE to_regclass('public.practical_scores_exam_part_submission_id_criterion_id_key') IS NULL
  UNION ALL SELECT 'assignment_submissions(assignment,student) unique (§24)'   WHERE to_regclass('public.assignment_submissions_assignment_id_student_id_key') IS NULL
  UNION ALL SELECT 'notice_reads(notice,user) pk (§24)'                        WHERE to_regclass('public.notice_reads_pkey') IS NULL
) missing;

-- ---------------------------------------------------------------------------
-- §25 주요 조회 인덱스
-- ---------------------------------------------------------------------------
SELECT check_name FROM (
  SELECT 'idx_users_role_status (§25)'                          AS check_name WHERE to_regclass('public.idx_users_role_status') IS NULL
  UNION ALL SELECT 'idx_users_name (§25)'                                     WHERE to_regclass('public.idx_users_name') IS NULL
  UNION ALL SELECT 'idx_users_phone (§25)'                                    WHERE to_regclass('public.idx_users_phone') IS NULL
  UNION ALL SELECT 'idx_subjects_field_active_order (§25)'                    WHERE to_regclass('public.idx_subjects_field_active_order') IS NULL
  UNION ALL SELECT 'idx_course_offerings_archived_name (§25)'                 WHERE to_regclass('public.idx_course_offerings_archived_name') IS NULL
  UNION ALL SELECT 'idx_course_offerings_instructor (§25)'                    WHERE to_regclass('public.idx_course_offerings_instructor') IS NULL
  UNION ALL SELECT 'idx_classes_archived_dates (§25)'                         WHERE to_regclass('public.idx_classes_archived_dates') IS NULL
  UNION ALL SELECT 'idx_class_instructor_assignments_instructor_to (§25)'     WHERE to_regclass('public.idx_class_instructor_assignments_instructor_to') IS NULL
  UNION ALL SELECT 'idx_class_sessions_class_starts_at (§25)'                 WHERE to_regclass('public.idx_class_sessions_class_starts_at') IS NULL
  UNION ALL SELECT 'idx_class_sessions_subject_starts_at (§25)'               WHERE to_regclass('public.idx_class_sessions_subject_starts_at') IS NULL
  UNION ALL SELECT 'idx_class_sessions_instructor_starts_at (§25)'            WHERE to_regclass('public.idx_class_sessions_instructor_starts_at') IS NULL
  UNION ALL SELECT 'idx_enrollments_student_status (§25)'                     WHERE to_regclass('public.idx_enrollments_student_status') IS NULL
  UNION ALL SELECT 'idx_enrollments_class_status (§25)'                       WHERE to_regclass('public.idx_enrollments_class_status') IS NULL
  UNION ALL SELECT 'idx_session_participants_student_session (§25)'           WHERE to_regclass('public.idx_session_participants_student_session') IS NULL
  UNION ALL SELECT 'attendance_records(session,status) (§25)'                 WHERE to_regclass('public.attendance_records_class_session_id_status_idx') IS NULL
  UNION ALL SELECT 'idx_attendance_records_student_created_at (§25)'          WHERE to_regclass('public.idx_attendance_records_student_created_at') IS NULL
  UNION ALL SELECT 'question_bank(subject,type,difficulty,active) (§25)'      WHERE to_regclass('public.question_bank_subject_id_type_difficulty_active_idx') IS NULL
  UNION ALL SELECT 'exams(offering,status) (§25)'                             WHERE to_regclass('public.exams_course_offering_id_status_idx') IS NULL
  UNION ALL SELECT 'exams(status,opens_at,closes_at) (§25)'                   WHERE to_regclass('public.exams_status_opens_at_closes_at_idx') IS NULL
  UNION ALL SELECT 'exam_attempts(student,status) (§25)'                      WHERE to_regclass('public.exam_attempts_student_id_status_idx') IS NULL
  UNION ALL SELECT 'exam_attempts(exam,status) (§25)'                         WHERE to_regclass('public.exam_attempts_exam_id_status_idx') IS NULL
  UNION ALL SELECT 'exam_part_submissions(status,deadline_at) (§25)'          WHERE to_regclass('public.exam_part_submissions_status_deadline_at_idx') IS NULL
  UNION ALL SELECT 'file_assets(status,delete_after) (§25)'                   WHERE to_regclass('public.file_assets_status_delete_after_idx') IS NULL
  UNION ALL SELECT 'notices(type,published_*) (§25)'                          WHERE to_regclass('public.notices_type_scope_published_from_published_until_idx') IS NULL
  UNION ALL SELECT 'notice_reads(user,read_at) (§25)'                         WHERE to_regclass('public.notice_reads_user_id_read_at_idx') IS NULL
  UNION ALL SELECT 'inquiries(status,created_at) (§25)'                       WHERE to_regclass('public.inquiries_status_created_at_idx') IS NULL
  UNION ALL SELECT 'audit_logs(resource_type,resource_id,created_at) (§25)'   WHERE to_regclass('public.audit_logs_resource_type_resource_id_created_at_idx') IS NULL
  UNION ALL SELECT 'system_logs(level,created_at) (§25)'                      WHERE to_regclass('public.system_logs_level_created_at_idx') IS NULL
  UNION ALL SELECT 'data_lifecycle_runs(job_type,started_at) (§25)'          WHERE to_regclass('public.data_lifecycle_runs_job_type_started_at_idx') IS NULL
) missing;

-- ---------------------------------------------------------------------------
-- §32 트리거·exclusion constraint (구현된 항목)
-- ---------------------------------------------------------------------------
SELECT check_name FROM (
  SELECT tg.name || ' (§32 trigger)' AS check_name
  FROM (VALUES
    ('question_bank_structure_check'),
    ('question_options_structure_check'),
    ('question_accepted_answers_structure_check'),
    ('exam_parts_totals_check'),
    ('exam_questions_totals_check'),
    ('exam_criteria_totals_check'),
    ('exam_questions_part_type_check'),
    ('exam_criteria_part_type_check'),
    ('exam_answers_shape_check'),
    ('exam_part_submissions_score_bound_check'),
    ('practical_scores_bound_check'),
    ('exams_status_transition_check'),
    ('exam_result_revisions_immutable'),
    ('trg_block_inquiry_reply_mutation'),
    ('trg_guard_inquiry_immutable_columns')
  ) AS tg(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = tg.name)

  UNION ALL
  SELECT 'ex_class_instructor_assignment_period (§32 exclusion)'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ex_class_instructor_assignment_period' AND contype = 'x'
  )
) missing;

-- ---------------------------------------------------------------------------
-- §18·§19 CHECK 제약 (공지·문의)
-- ---------------------------------------------------------------------------
SELECT check_name FROM (
  SELECT c.name || ' (§18/§19 check)' AS check_name
  FROM (VALUES
    ('chk_notices_instructor_scope_all'),
    ('chk_notices_publish_window'),
    ('chk_notices_text_not_blank'),
    ('chk_inquiries_class_id_by_type'),
    ('chk_inquiries_closed_at'),
    ('chk_inquiries_text_not_blank'),
    ('chk_inquiry_replies_content_not_blank')
  ) AS c(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name AND contype = 'c')
) missing;

-- ---------------------------------------------------------------------------
-- 데이터가 업무 유니크 규칙을 이미 위반하고 있지 않은지
-- ---------------------------------------------------------------------------
SELECT 'DATA: 중복 활성 정규 수강 (student, offering)' AS check_name
FROM enrollments WHERE status = 'ACTIVE' AND type = 'REGULAR'
GROUP BY student_id, course_offering_id HAVING count(*) > 1;

SELECT 'DATA: 중복 활성 수강 (student, class, offering, type)' AS check_name
FROM enrollments WHERE status = 'ACTIVE'
GROUP BY student_id, class_id, course_offering_id, type HAVING count(*) > 1;

SELECT 'DATA: 원수업당 취소되지 않은 보강 2개 이상' AS check_name
FROM class_sessions
WHERE replacement_for_session_id IS NOT NULL AND status <> 'CANCELED'
GROUP BY replacement_for_session_id HAVING count(*) > 1;

SELECT 'DATA: 반당 현재 담당 강사 2명 이상' AS check_name
FROM class_instructor_assignments WHERE assigned_to IS NULL
GROUP BY class_id HAVING count(*) > 1;
