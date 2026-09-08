/**
 * 운영 기준 시간대는 Asia/Seoul 하나다.
 *
 * DB에는 시각을 UTC(`timestamptz`)로, 날짜만 필요한 값은 UTC 자정(`date`)으로
 * 저장하고, "오늘인가 / 시작 전인가 / 같은 날인가" 같은 업무 판정은 항상
 * 이 유틸을 통해 Asia/Seoul 기준으로 계산한다.
 *
 * 서비스마다 UTC `toISOString()`, 로케일 변환, +9시간 오프셋 덧셈을 제각각
 * 쓰면 같은 순간에 대해 서로 다른 날짜가 나오므로 반드시 이 유틸만 사용한다.
 */
export const SEOUL_TIME_ZONE = 'Asia/Seoul';

/** 임의의 시각을 Asia/Seoul 기준 `YYYY-MM-DD` 문자열로 변환한다. */
export function toSeoulDateString(value: Date): string {
  return value.toLocaleDateString('sv-SE', { timeZone: SEOUL_TIME_ZONE });
}

/** 지금(Asia/Seoul)의 날짜를 `YYYY-MM-DD` 문자열로 반환한다. */
export function todaySeoulDateString(): string {
  return toSeoulDateString(new Date());
}

/**
 * `YYYY-MM-DD` 문자열을 UTC 자정 `Date`로 변환한다.
 * Prisma `@db.Date` 열에 저장하거나 비교할 때 사용한다.
 */
export function toUtcDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** 오늘(Asia/Seoul)을 UTC 자정 `Date`로 반환한다. */
export function todaySeoulDateOnly(): Date {
  return toUtcDateOnly(todaySeoulDateString());
}

/**
 * 주어진 시각이 속한 Asia/Seoul 날짜의 마지막 순간(23:59:59.999 KST)을 UTC `Date`로
 * 반환한다. 강사의 출석 수정 마감처럼 "그 수업이 진행된 날의 당일 자정 직전"까지를
 * 판정할 때 사용한다.
 */
export function toSeoulEndOfDay(value: Date): Date {
  return new Date(`${toSeoulDateString(value)}T23:59:59.999+09:00`);
}
