import type {
  ExamPartInput,
  ExamPartType,
  ExamScope,
  ExamStage,
  ExamTemplate,
  ExamTemplateInput,
} from "./exam-templates.api";

export const SCOPE_LABELS: Record<ExamScope, string> = {
  SUBJECT: "과목형",
  COMPREHENSIVE: "종합형",
};
export const STAGE_LABELS: Record<ExamStage, string> = {
  REGULAR: "일반",
  MIDTERM: "중간",
  FINAL: "기말",
};
export const PART_LABELS: Record<ExamPartType, string> = {
  WRITTEN: "필기",
  PRACTICAL: "실기",
};
export const MIB = 1_048_576;
/** 실기 제출 파일당 최대 크기. 서버가 5 MiB로 고정하므로 화면에서도 편집하지 않는다. */
export const PRACTICAL_FILE_SIZE_BYTES = 5 * MIB;
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";

export function validateTemplate(input: ExamTemplateInput): string | null {
  if (!input.name.trim()) return "템플릿 이름을 입력해 주세요.";
  if (input.name.trim().length > 200)
    return "템플릿 이름은 200자 이내로 입력해 주세요.";
  if (input.scope === "SUBJECT" && input.subjectIds.length !== 1)
    return "과목형은 과목을 정확히 1개 선택해 주세요.";
  if (!input.subjectIds.length) return "과목을 1개 이상 선택해 주세요.";
  if (
    input.defaultOpenDays !== undefined &&
    (!Number.isInteger(input.defaultOpenDays) ||
      input.defaultOpenDays < 1 ||
      input.defaultOpenDays > 365)
  )
    return "기본 응시 기간은 1~365일로 입력해 주세요.";
  return null;
}

/** Omit unchanged subjects/scope: creators may edit metadata after their assignment ends. */
export function templateUpdate(
  input: ExamTemplateInput,
  existing: ExamTemplate,
): Partial<ExamTemplateInput> {
  const { subjectIds, scope, ...metadata } = input;
  const sameSubjects =
    subjectIds.length === existing.subjects.length &&
    existing.subjects.every((subject) =>
      subjectIds.includes(subject.subjectId),
    );
  return {
    ...metadata,
    ...(scope !== existing.scope ? { scope } : {}),
    ...(!sameSubjects ? { subjectIds } : {}),
  };
}

export function validatePart(input: ExamPartInput): string | null {
  const scoreValid = (n: number, min: number) =>
    Number.isFinite(n) &&
    n >= min &&
    n <= 9999.99 &&
    Math.abs(n * 100 - Math.round(n * 100)) < 0.000001;
  if (!scoreValid(input.totalScore, 0.01) || !scoreValid(input.passScore, 0))
    return "총점과 합격 점수는 소수점 둘째 자리까지, 최대 9999.99점으로 입력해 주세요.";
  if (input.passScore > input.totalScore)
    return "합격 점수는 총점보다 클 수 없습니다.";
  if (
    !Number.isInteger(input.defaultOpenOffsetDays) ||
    input.defaultOpenOffsetDays < 0 ||
    input.defaultOpenOffsetDays > 3650
  )
    return "시작일 차이는 0~3650일로 입력해 주세요.";
  if (
    !Number.isInteger(input.defaultOpenDays) ||
    input.defaultOpenDays < 1 ||
    input.defaultOpenDays > 365
  )
    return "응시 기간은 1~365일로 입력해 주세요.";
  if (input.durationMinutes !== undefined) {
    if (
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 1 ||
      input.durationMinutes > 1440
    )
      return "필기 제한 시간은 1~1440분으로 입력해 주세요.";
  } else {
    if (
      ![input.minFiles, input.maxFiles].every(
        (n) => Number.isInteger(n) && n >= 1 && n <= 5,
      )
    )
      return "제출 파일 수는 1~5개로 입력해 주세요.";
    if (input.minFiles > input.maxFiles)
      return "최소 제출 파일 수는 최대 제출 파일 수보다 많을 수 없습니다.";
    if (
      !Number.isInteger(input.maxTotalSizeBytes) ||
      input.maxTotalSizeBytes < 1 ||
      input.maxTotalSizeBytes > 40 * MIB
    )
      return "제출 전체 최대 크기는 40 MiB 이내로 입력해 주세요.";
  }
  return null;
}
