/**
 * 단답형 주관식 자동 채점을 위한 정답 정규화 유틸이다.
 *
 * 학생 답안과 허용 정답을 같은 규칙으로 정규화한 뒤 문자열 전체가 완전히
 * 일치할 때만 정답으로 처리한다. 부분 문자열 포함 여부는 절대 사용하지 않는다.
 *
 * 이 규칙은 문제은행 저장 시 `question_accepted_answers.normalized_answer`를
 * 만들 때와, 실제 시험 답안을 자동 채점할 때 양쪽에서 쓰인다. 두 곳의 규칙이
 * 어긋나면 정답이 오답으로 채점되므로 반드시 이 파일의 함수만 사용한다.
 *
 * 규칙을 바꿔야 하면 기존 함수를 수정하지 말고 새 버전 함수를 추가한다.
 * 이미 채점된 시험 결과가 소급해서 달라지면 안 된다.
 */

/**
 * 현재 정규화 규칙의 버전이다.
 *
 * 규칙이 바뀌면 이 값을 올리고 새 함수를 추가한다. 기존 데이터는 저장 당시의
 * 버전으로 정규화된 값을 그대로 유지한다.
 */
export const ANSWER_NORMALIZATION_VERSION = 1;

/**
 * 답안을 자동 채점용으로 정규화한다.
 *
 * 규칙(v1):
 * 1. Unicode NFC 정규화 — 자소 분리된 한글과 결합 문자를 한 형태로 통일한다.
 * 2. 연속된 공백을 한 칸으로 축약 — 전각 공백(U+3000)과 탭·줄바꿈도 포함한다.
 * 3. 앞뒤 공백 제거.
 * 4. 영문 대소문자 통일(소문자).
 *
 * 반환값은 완전 일치 비교에만 사용하고 화면 표시에는 원문을 쓴다.
 */
export function normalizeAnswer(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 학생 답안이 허용 정답 중 하나와 일치하는지 판정한다.
 *
 * `acceptedNormalizedAnswers`에는 이미 정규화되어 저장된 값을 넘긴다.
 * 학생 답안만 이 함수 안에서 정규화한다.
 */
export function matchesAcceptedAnswer(
  studentAnswer: string,
  acceptedNormalizedAnswers: readonly string[],
): boolean {
  const normalized = normalizeAnswer(studentAnswer);

  if (normalized.length === 0) {
    return false;
  }

  return acceptedNormalizedAnswers.includes(normalized);
}
