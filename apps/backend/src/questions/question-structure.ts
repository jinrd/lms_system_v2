import { QuestionType } from '../generated/prisma/enums';

/**
 * 유형별 보기·허용 정답 개수 규칙(기획안 §12.1)의 판정 입력이다.
 *
 * 개수만 보면 되므로 보기·정답 본문은 받지 않는다.
 */
export type QuestionStructureInput = {
  type: QuestionType;
  optionCount: number;
  correctOptionCount: number;
  acceptedAnswerCount: number;
};

/**
 * 문제 구조가 유형별 규칙에 맞는지 검사한다.
 *
 * 규칙에 맞으면 `null`, 어긋나면 한국어 사유 문자열을 돌려준다. 던지지 않는다.
 * 문제은행 저장(생성·수정·활성 전환)과 시험 템플릿 활성화 검증에서 같은 규칙을
 * 써야 하므로 순수 함수로 분리했다.
 *
 * - `SINGLE_CHOICE`: 보기 2개 이상, 정답 보기 정확히 1개, 허용 정답 없음
 * - `MULTIPLE_CHOICE`: 보기 2개 이상, 정답 보기 1개 이상, 허용 정답 없음
 * - `SHORT_ANSWER`: 보기 없음, 허용 정답 1개 이상
 */
export function checkQuestionStructure(
  input: QuestionStructureInput,
): string | null {
  const { type, optionCount, correctOptionCount, acceptedAnswerCount } = input;

  if (type === QuestionType.SHORT_ANSWER) {
    if (optionCount > 0) {
      return '단답형 문제에는 보기를 넣을 수 없습니다.';
    }
    if (acceptedAnswerCount === 0) {
      return '단답형 문제에는 허용 정답이 최소 1개 필요합니다.';
    }
    return null;
  }

  if (acceptedAnswerCount > 0) {
    return '객관식 문제에는 허용 정답 목록을 넣을 수 없습니다.';
  }
  if (optionCount < 2) {
    return '객관식 문제에는 보기가 2개 이상 필요합니다.';
  }
  if (type === QuestionType.SINGLE_CHOICE && correctOptionCount !== 1) {
    return '단일 선택 문제의 정답 보기는 정확히 1개여야 합니다.';
  }
  if (type === QuestionType.MULTIPLE_CHOICE && correctOptionCount < 1) {
    return '복수 선택 문제의 정답 보기는 1개 이상이어야 합니다.';
  }

  return null;
}
