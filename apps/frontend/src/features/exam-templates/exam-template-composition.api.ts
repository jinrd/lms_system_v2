import { apiRequest } from "../../lib/api-client";
import type {
  DifficultyLevel,
  QuestionOption,
  QuestionAcceptedAnswer,
  QuestionType,
} from "../questions/questions.api";
import type { ExamPartType, ExamTemplate } from "./exam-templates.api";

// 5단계: 시험 템플릿 파트 구성(필기 문제 선택 · 실기 평가 항목)
// 6단계: 활성화 검증 · 활성/비활성 전환 · 복제
// 기존 exam-templates.api.ts 를 건드리지 않고 새 엔드포인트만 여기서 다룬다.

export type TemplateQuestionEntry = {
  id: string;
  questionId: string;
  displayOrder: number;
  score: number;
  question: {
    id: string;
    subjectId: string;
    type: QuestionType;
    prompt: string;
    explanation: string | null;
    difficulty: DifficultyLevel;
    defaultScore: number;
    active: boolean;
    options: QuestionOption[];
    acceptedAnswers: QuestionAcceptedAnswer[];
  };
};

export type TemplateCriterionEntry = {
  id: string;
  name: string;
  description: string | null;
  maxScore: number;
  displayOrder: number;
};

type CompositionSummary = {
  templateId: string;
  partId: string;
  partTotalScore: number;
  /** 담긴 점수 합계다. */
  assignedScoreSum: number;
  /** `assignedScoreSum - partTotalScore`. 양수면 초과, 음수면 부족이다. */
  difference: number;
};

export type TemplateQuestionsResponse = CompositionSummary & {
  questions: TemplateQuestionEntry[];
};

export type TemplateCriteriaResponse = CompositionSummary & {
  criteria: TemplateCriterionEntry[];
};

export type TemplateQuestionInput = { questionId: string; score: number };
export type TemplateCriterionInput = {
  name: string;
  description?: string;
  maxScore: number;
};

export type ValidationIssue = {
  code:
    | "SCOPE_SUBJECT_COUNT"
    | "SUBJECT_INACTIVE"
    | "NO_PARTS"
    | "WRITTEN_NO_QUESTIONS"
    | "WRITTEN_SCORE_MISMATCH"
    | "PRACTICAL_NO_CRITERIA"
    | "PRACTICAL_SCORE_MISMATCH"
    | "QUESTION_STRUCTURE_INVALID"
    | "QUESTION_INACTIVE";
  part: ExamPartType | null;
  questionId: string | null;
  message: string;
};

export type ValidationResult = {
  templateId: string;
  valid: boolean;
  issues: ValidationIssue[];
};

export function getTemplateWrittenQuestions(
  templateId: string,
): Promise<TemplateQuestionsResponse> {
  return apiRequest(`/exam-templates/${templateId}/parts/WRITTEN/questions`);
}

export function replaceTemplateWrittenQuestions(
  templateId: string,
  questions: TemplateQuestionInput[],
): Promise<TemplateQuestionsResponse> {
  return apiRequest(`/exam-templates/${templateId}/parts/WRITTEN/questions`, {
    method: "PUT",
    body: { questions },
  });
}

export function getTemplatePracticalCriteria(
  templateId: string,
): Promise<TemplateCriteriaResponse> {
  return apiRequest(`/exam-templates/${templateId}/parts/PRACTICAL/criteria`);
}

export function replaceTemplatePracticalCriteria(
  templateId: string,
  criteria: TemplateCriterionInput[],
): Promise<TemplateCriteriaResponse> {
  return apiRequest(`/exam-templates/${templateId}/parts/PRACTICAL/criteria`, {
    method: "PUT",
    body: { criteria },
  });
}

export function validateExamTemplate(
  templateId: string,
): Promise<ValidationResult> {
  return apiRequest(`/exam-templates/${templateId}/validate`);
}

export function activateExamTemplate(
  templateId: string,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${templateId}/activate`, {
    method: "POST",
  });
}

export function deactivateExamTemplate(
  templateId: string,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${templateId}/deactivate`, {
    method: "POST",
  });
}

export function duplicateExamTemplate(
  templateId: string,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${templateId}/duplicate`, {
    method: "POST",
  });
}
