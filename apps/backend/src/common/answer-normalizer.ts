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
 * 규칙을 바꿔야 하면 기존 버전 함수를 수정하지 말고 새 버전을 `NORMALIZERS`에
 * 추가한다. 실제 시험 문항은 스냅샷 당시의 버전을 `exam_questions.normalization_version`
 * 에, 학생 답안은 저장 당시 정규화한 값을 `exam_answers.normalized_text`에
 * 동결해 두므로, 규칙이 바뀌어도 이미 치른 시험을 다시 채점하면 같은 결과가 나온다.
 */

/**
 * 현재(기본) 정규화 규칙의 버전이다. 새 문항 스냅샷과 새 답안 저장에 이 버전을 쓴다.
 */
export const ANSWER_NORMALIZATION_VERSION = 1;

/**
 * 규칙(v1):
 * 1. Unicode NFC 정규화 — 자소 분리된 한글과 결합 문자를 한 형태로 통일한다.
 * 2. 연속된 공백을 한 칸으로 축약 — 전각 공백(U+3000)과 탭·줄바꿈도 포함한다.
 * 3. 앞뒤 공백 제거.
 * 4. 영문 대소문자 통일(소문자).
 */
function normalizeAnswerV1(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 버전 번호 → 정규화 함수. 규칙을 바꾸면 새 항목을 추가하고 기존 항목은 두 번 다시 건드리지 않는다. */
const NORMALIZERS: Record<number, (raw: string) => string> = {
  1: normalizeAnswerV1,
};

/**
 * 지정한 버전 규칙으로 답안을 정규화한다. 없는 버전이면 오류다 —
 * 조용히 다른 규칙으로 채점해 정답이 뒤집히는 일을 막는다.
 */
export function normalizeAnswerForVersion(
  raw: string,
  version: number,
): string {
  const normalizer = NORMALIZERS[version];
  if (!normalizer) {
    throw new Error(`알 수 없는 답안 정규화 버전입니다: ${version}`);
  }
  return normalizer(raw);
}

/**
 * 현재 기본 버전으로 답안을 정규화한다. 화면 표시에는 원문을 쓰고 이 값은
 * 완전 일치 비교에만 사용한다.
 */
export function normalizeAnswer(raw: string): string {
  return normalizeAnswerForVersion(raw, ANSWER_NORMALIZATION_VERSION);
}

/**
 * 학생 답안이 허용 정답 중 하나와 일치하는지 판정한다.
 *
 * `acceptedNormalizedAnswers`에는 이미 정규화되어 저장된 값을 넘긴다.
 * 학생 답안만 이 함수 안에서 `version` 규칙으로 정규화한다. `version`을 생략하면
 * 현재 기본 버전을 쓴다. 실제 채점에서는 반드시 해당 문항의
 * `exam_questions.normalization_version`을 넘긴다.
 */
export function matchesAcceptedAnswer(
  studentAnswer: string,
  acceptedNormalizedAnswers: readonly string[],
  version: number = ANSWER_NORMALIZATION_VERSION,
): boolean {
  const normalized = normalizeAnswerForVersion(studentAnswer, version);

  if (normalized.length === 0) {
    return false;
  }

  return acceptedNormalizedAnswers.includes(normalized);
}
