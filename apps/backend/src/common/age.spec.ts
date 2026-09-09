import { describe, expect, it } from '@jest/globals';
import { isMinorOn } from './age';

describe('isMinorOn (기획안 §3, 만 19세 미만)', () => {
  const at = new Date('2026-06-15T00:00:00.000Z');

  it('만 20세는 성인이다', () => {
    expect(isMinorOn(new Date('2006-01-01'), at)).toBe(false);
  });

  it('만 18세는 미성년이다', () => {
    expect(isMinorOn(new Date('2008-01-01'), at)).toBe(true);
  });

  it('생일이 지나 정확히 만 19세가 된 날은 성인이다', () => {
    // 기준일 2026-06-15, 생일 2007-06-15 → 만 19세
    expect(isMinorOn(new Date('2007-06-15'), at)).toBe(false);
  });

  it('만 19세 생일 하루 전날까지는 미성년이다', () => {
    expect(isMinorOn(new Date('2007-06-16'), at)).toBe(true);
  });
});
