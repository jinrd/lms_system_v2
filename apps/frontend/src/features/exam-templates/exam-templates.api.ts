import { apiRequest } from "../../lib/api-client";

export type ExamScope = "SUBJECT" | "COMPREHENSIVE";
export type ExamStage = "REGULAR" | "MIDTERM" | "FINAL";
export type ExamPartType = "WRITTEN" | "PRACTICAL";
export type ExamTemplatePart = {
  id: string;
  type: ExamPartType;
  totalScore: number;
  passScore: number;
  durationMinutes: number | null;
  defaultOpenOffsetDays: number;
  defaultOpenDays: number;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
  instructions: string | null;
};
export type ExamTemplate = {
  id: string;
  name: string;
  description: string | null;
  scope: ExamScope;
  stage: ExamStage;
  defaultOpenDays: number | null;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: { subjectId: string; name: string; active: boolean }[];
  parts: ExamTemplatePart[];
};
export type ExamTemplateInput = {
  name: string;
  description?: string;
  scope: ExamScope;
  stage: ExamStage;
  defaultOpenDays?: number;
  subjectIds: string[];
};
export type ExamPartInput = {
  totalScore: number;
  passScore: number;
  defaultOpenOffsetDays: number;
  defaultOpenDays: number;
  instructions?: string;
} & (
  | {
      durationMinutes: number;
      minFiles?: never;
      maxFiles?: never;
      maxFileSizeBytes?: never;
      maxTotalSizeBytes?: never;
    }
  | {
      durationMinutes?: never;
      minFiles: number;
      maxFiles: number;
      maxFileSizeBytes: number;
      maxTotalSizeBytes: number;
    }
);
export type ExamTemplateQuery = {
  page?: number;
  limit?: number;
  keyword?: string;
  scope?: ExamScope;
  stage?: ExamStage;
  active?: boolean;
};
export type ExamTemplatePage = {
  items: ExamTemplate[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
export function getExamTemplates(
  query: ExamTemplateQuery = {},
): Promise<ExamTemplatePage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 20),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.scope) params.set("scope", query.scope);
  if (query.stage) params.set("stage", query.stage);
  if (query.active !== undefined) params.set("active", String(query.active));
  return apiRequest(`/exam-templates?${params}`);
}
export function getExamTemplate(id: string): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${id}`);
}
export function createExamTemplate(
  input: ExamTemplateInput,
): Promise<ExamTemplate> {
  return apiRequest("/exam-templates", { method: "POST", body: input });
}
export function updateExamTemplate(
  id: string,
  input: Partial<ExamTemplateInput>,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${id}`, { method: "PATCH", body: input });
}
export function saveExamTemplatePart(
  id: string,
  type: ExamPartType,
  input: ExamPartInput,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${id}/parts/${type}`, {
    method: "PUT",
    body: input,
  });
}
export function deleteExamTemplatePart(
  id: string,
  type: ExamPartType,
): Promise<ExamTemplate> {
  return apiRequest(`/exam-templates/${id}/parts/${type}`, {
    method: "DELETE",
  });
}
