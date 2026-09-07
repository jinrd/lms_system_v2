import { describe, expect, it } from '@jest/globals';
import {
  SYSTEM_SETTING_DEFAULTS,
  SYSTEM_SETTING_DESCRIPTIONS,
} from './system-settings';

describe('SYSTEM_SETTING_DEFAULTS', () => {
  it('9단계 배치가 읽는 보존 정책 키를 모두 담는다', () => {
    const required = [
      'retention.audit_log_days',
      'retention.system_log_days',
      'retention.attendance_code_attempt_days',
      'retention.data_lifecycle_run_days',
      'student.inactive_retention_days',
      'student.rejected_signup_retention_days',
    ] as const;

    for (const key of required) {
      expect(typeof SYSTEM_SETTING_DEFAULTS[key]).toBe('number');
      expect(SYSTEM_SETTING_DEFAULTS[key]).toBeGreaterThan(0);
    }
  });

  it('기획안 22장 기준 키 개수를 유지한다', () => {
    expect(Object.keys(SYSTEM_SETTING_DEFAULTS)).toHaveLength(36);
  });

  it('설명은 실제 키에만 붙는다', () => {
    const defaultKeys = new Set(Object.keys(SYSTEM_SETTING_DEFAULTS));
    for (const key of Object.keys(SYSTEM_SETTING_DESCRIPTIONS)) {
      expect(defaultKeys.has(key)).toBe(true);
    }
  });
});
