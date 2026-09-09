/**
 * 두 id 집합이 완전히 같은지 판정한다(순서·중복 무시).
 *
 * 복수 선택 객관식 채점(기획안 §8.2·D-24)에 쓴다: 학생이 고른 보기 집합과
 * 정답 보기 집합이 **완전히 일치**할 때만 정답이며, 부분 점수는 없다.
 */
export function exactSetMatch(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) {
    return false;
  }
  for (const value of setA) {
    if (!setB.has(value)) {
      return false;
    }
  }
  return true;
}
