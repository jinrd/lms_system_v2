/**
 * 만 나이 미성년 판정이다(기획안 §3). 한국 기준 만 19세 미만이면 미성년으로 본다.
 *
 * 회원가입에서 클라이언트가 준 미성년 플래그를 믿지 않고 생년월일로 서버가
 * 재계산할 때 쓴다.
 */
export function isMinorOn(birthDate: Date, at: Date): boolean {
  const cutoff = new Date(at);
  cutoff.setFullYear(cutoff.getFullYear() - 19);
  // 생일이 (기준일 - 19년)보다 뒤면 아직 만 19세가 되지 않은 것이다.
  return birthDate.getTime() > cutoff.getTime();
}
