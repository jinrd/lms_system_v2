/**
 * 출석률 계산이다(기획안 §7·D-05).
 *
 *   출석 = 1.0
 *   지각 = 1.0  (지각 횟수는 별도 집계)
 *   조퇴 = 0.5
 *   결석 = 0
 *   공결·미처리 = 분자·분모에서 제외
 *
 *   출석률 = (출석 + 지각 + 조퇴×0.5) ÷ (출석 + 지각 + 조퇴 + 결석) × 100
 *
 * 휴강(취소) 수업 제외는 호출부에서 집계 전에 걸러야 한다. 이 함수는 이미 걸러진
 * 상태별 개수만 받는다.
 */
export type AttendanceStatusCounts = {
  present?: number;
  late?: number;
  earlyLeave?: number;
  absent?: number;
  excused?: number;
  unprocessed?: number;
};

export type AttendanceBucket = {
  present: number;
  late: number;
  earlyLeave: number;
  absent: number;
  excused: number;
  unprocessed: number;
  /** 지각 횟수 별도 집계(§7). `late`와 같은 값이지만 명시적으로 노출한다. */
  lateCount: number;
  /** 출석률 분모: 출석 + 지각 + 조퇴 + 결석. */
  countedTotal: number;
  /** 소수 첫째 자리까지. 분모가 0이면 `null`. */
  attendanceRate: number | null;
};

export function computeAttendanceBucket(
  counts: AttendanceStatusCounts,
): AttendanceBucket {
  const present = counts.present ?? 0;
  const late = counts.late ?? 0;
  const earlyLeave = counts.earlyLeave ?? 0;
  const absent = counts.absent ?? 0;
  const excused = counts.excused ?? 0;
  const unprocessed = counts.unprocessed ?? 0;

  const countedTotal = present + late + earlyLeave + absent;
  const earned = present + late + earlyLeave * 0.5;

  return {
    present,
    late,
    earlyLeave,
    absent,
    excused,
    unprocessed,
    lateCount: late,
    countedTotal,
    attendanceRate:
      countedTotal === 0
        ? null
        : Math.round((earned / countedTotal) * 1000) / 10,
  };
}
