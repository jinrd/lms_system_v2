import { describe, expect, it } from '@jest/globals';
import {
  toSeoulDateString,
  toSeoulEndOfDay,
  toUtcDateOnly,
} from './seoul-date';

describe('seoul-date (Asia/Seoul, UTC+9)', () => {
  describe('toSeoulDateString', () => {
    it('UTC 15:00은 KST로 다음 날이다', () => {
      // 2026-03-10 15:00Z = 2026-03-11 00:00 KST
      expect(toSeoulDateString(new Date('2026-03-10T15:00:00Z'))).toBe(
        '2026-03-11',
      );
    });

    it('UTC 14:59는 아직 같은 날 KST 23:59다', () => {
      expect(toSeoulDateString(new Date('2026-03-10T14:59:00Z'))).toBe(
        '2026-03-10',
      );
    });
  });

  describe('toSeoulEndOfDay', () => {
    it('그 시각이 속한 KST 날짜의 23:59:59.999 = 다음 날 14:59:59.999Z', () => {
      const end = toSeoulEndOfDay(new Date('2026-03-10T02:00:00Z'));
      expect(end.toISOString()).toBe('2026-03-10T14:59:59.999Z');
    });

    it('KST 자정 직전에 정확히 걸치는 순간까지 포함한다', () => {
      const justBeforeMidnightKst = new Date('2026-03-10T14:59:59.999Z');
      const end = toSeoulEndOfDay(justBeforeMidnightKst);
      expect(justBeforeMidnightKst.getTime()).toBeLessThanOrEqual(
        end.getTime(),
      );
    });

    it('KST 자정을 막 넘긴 순간은 다음 날의 마감으로 넘어간다', () => {
      const justAfterMidnightKst = new Date('2026-03-10T15:00:00.000Z');
      expect(toSeoulEndOfDay(justAfterMidnightKst).toISOString()).toBe(
        '2026-03-11T14:59:59.999Z',
      );
    });
  });

  describe('toUtcDateOnly', () => {
    it('YYYY-MM-DD를 UTC 자정으로 변환한다', () => {
      expect(toUtcDateOnly('2026-03-11').toISOString()).toBe(
        '2026-03-11T00:00:00.000Z',
      );
    });
  });
});
