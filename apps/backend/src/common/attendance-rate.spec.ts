import { describe, expect, it } from '@jest/globals';
import { computeAttendanceBucket } from './attendance-rate';

describe('computeAttendanceBucket (기획안 §7·D-05)', () => {
  it('빈 입력이면 모두 0이고 출석률은 null이다', () => {
    const b = computeAttendanceBucket({});
    expect(b).toMatchObject({ countedTotal: 0, attendanceRate: null });
  });

  it('출석·지각은 1.0으로 계산한다', () => {
    // 출석 3, 지각 1 → (3 + 1) / 4 = 100%
    const b = computeAttendanceBucket({ present: 3, late: 1 });
    expect(b.attendanceRate).toBe(100);
    expect(b.lateCount).toBe(1);
    expect(b.countedTotal).toBe(4);
  });

  it('조퇴는 0.5로 계산한다', () => {
    // 출석 1, 조퇴 1 → (1 + 0.5) / 2 = 75%
    expect(
      computeAttendanceBucket({ present: 1, earlyLeave: 1 }).attendanceRate,
    ).toBe(75);
  });

  it('결석은 0이며 분모에는 포함된다', () => {
    // 출석 1, 결석 1 → 1 / 2 = 50%
    expect(
      computeAttendanceBucket({ present: 1, absent: 1 }).attendanceRate,
    ).toBe(50);
  });

  it('공결·미처리는 분자·분모 모두에서 제외한다', () => {
    // 출석 1 + 공결 5 + 미처리 5 → 분모는 여전히 1, 출석률 100%
    const b = computeAttendanceBucket({
      present: 1,
      excused: 5,
      unprocessed: 5,
    });
    expect(b.countedTotal).toBe(1);
    expect(b.attendanceRate).toBe(100);
    expect(b.excused).toBe(5);
    expect(b.unprocessed).toBe(5);
  });

  it('출석률은 소수 첫째 자리까지 반올림한다', () => {
    // 출석 1, 결석 2 → 1/3 = 33.333… → 33.3
    expect(
      computeAttendanceBucket({ present: 1, absent: 2 }).attendanceRate,
    ).toBe(33.3);
  });

  it('전형적인 혼합 케이스', () => {
    // 출석 8, 지각 2, 조퇴 2, 결석 3 → (8 + 2 + 1) / 15 = 73.333… → 73.3
    const b = computeAttendanceBucket({
      present: 8,
      late: 2,
      earlyLeave: 2,
      absent: 3,
    });
    expect(b.countedTotal).toBe(15);
    expect(b.attendanceRate).toBe(73.3);
  });
});
