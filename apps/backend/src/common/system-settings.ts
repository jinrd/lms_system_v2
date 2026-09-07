/**
 * 운영 중 조정 가능한 정책값의 기본값이다. 기획안 Part II 22장의 초기 설정을
 * 그대로 옮겼다.
 *
 * 이 맵이 기본값의 단일 출처다. `system_settings` 테이블에 같은 키의 행이 있으면
 * 그 값이 우선하고, 없으면 여기 값을 쓴다. 시드는 이 맵을 그대로 upsert 하되
 * 이미 있는 행은 건드리지 않아 운영자가 조정한 값이 유지되도록 한다.
 *
 * 지금은 9단계(로그·생명주기 배치)가 읽는 `retention.*`, `student.*` 키만
 * 실제 코드에서 참조한다. 나머지 키는 초기화 완료 조건(기획안 Part II 33장 3번)을
 * 만족시키기 위해 테이블에 존재하기만 하면 되며, 기존에 상수로 박혀 있는
 * 인증·출석 정책값을 이 테이블로 옮기는 일은 별도 과제로 미룬다.
 */
export const SYSTEM_SETTING_DEFAULTS = {
  'attendance.present_grace_minutes': 5,
  'attendance.code_valid_minutes': 10,
  'attendance.max_failed_code_attempts': 5,
  'attendance.ip_code_attempts_per_minute': 300,
  'retention.audit_log_days': 1095,
  'retention.system_log_days': 90,
  'retention.attendance_code_attempt_days': 90,
  'retention.data_lifecycle_run_days': 1095,
  'attendance.present_weight': 1.0,
  'attendance.late_weight': 1.0,
  'attendance.early_leave_weight': 0.5,
  'attendance.absent_weight': 0,
  'attendance.excused_excluded': true,
  'attendance.unprocessed_excluded': true,
  'student.inactive_retention_days': 365,
  'student.rejected_signup_retention_days': 30,
  'auth.access_token_minutes': 15,
  'auth.session_hours': 24,
  'auth.max_failed_login_attempts': 5,
  'auth.login_lock_minutes': 15,
  'auth.temporary_password_hours': 24,
  'exam.result_revision_days_for_instructor': 7,
  'upload.practical.allowed_mime_types': [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
  'upload.practical.max_file_size_bytes': 5_242_880,
  'upload.practical.max_file_count': 5,
  'upload.practical.max_total_size_bytes': 41_943_040,
  'upload.general.allowed_extensions': [
    'jpg',
    'jpeg',
    'png',
    'webp',
    'heic',
    'heif',
    'pdf',
    'hwp',
    'hwpx',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
  ],
  'upload.general.student_instructor.image_max_bytes': 10_485_760,
  'upload.general.student_instructor.document_max_bytes': 20_971_520,
  'upload.general.student_instructor.max_file_count': 5,
  'upload.general.student_instructor.max_total_bytes': 52_428_800,
  'upload.general.manager_principal_admin.max_file_size_bytes': 104_857_600,
  'upload.pending_orphan_hours': 24,
  'file_retention.practical_and_assignment_days_after_course': 365,
  'file_retention.inquiry_days_after_closed': 365,
  'file_retention.notice_days_after_publish_end': 90,
} as const;

export type SystemSettingKey = keyof typeof SYSTEM_SETTING_DEFAULTS;

/** 사람이 읽을 설명. 없는 키는 설명 없이 저장한다. */
export const SYSTEM_SETTING_DESCRIPTIONS: Partial<
  Record<SystemSettingKey, string>
> = {
  'retention.audit_log_days': '감사 로그 보관 일수. 지나면 배치가 삭제한다.',
  'retention.system_log_days': '시스템 로그 보관 일수. 지나면 배치가 삭제한다.',
  'retention.attendance_code_attempt_days':
    '출석 코드 입력 시도 이력 보관 일수.',
  'retention.data_lifecycle_run_days': '생명주기 배치 실행 이력 보관 일수.',
  'student.inactive_retention_days':
    '학생 비활성 후 개인정보 익명화까지의 유예 일수.',
  'student.rejected_signup_retention_days':
    '가입 거절 계정을 물리 삭제하기까지의 보관 일수.',
};
