import { apiRequest } from "../../lib/api-client";
import type { ExamPartType, ExamScope, ExamStage } from "../exam-templates/exam-templates.api";
import type { QuestionType } from "../questions/questions.api";

export type { ExamPartType, ExamScope, ExamStage };

export type ExamStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "GRADING"
  | "COMPLETED"
  | "CANCELED";

export type ExamPart = {
  id: string;
  type: ExamPartType;
  totalScore: number;
  passScore: number;
  opensAt: string;
  closesAt: string;
  durationMinutes: number | null;
  minFiles: number | null;
  maxFiles: number | null;
  maxFileSizeBytes: number | null;
  maxTotalSizeBytes: number | null;
  instructions: string | null;
};

export type Exam = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  sourceTemplateId: string | null;
  sourceExamId: string | null;
  title: string;
  description: string | null;
  scope: ExamScope;
  stage: ExamStage;
  status: ExamStatus;
  opensAt: string;
  closesAt: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  subjects: Array<{
    courseOfferingSubjectId: string;
    subjectId: string;
    name: string;
    active: boolean;
  }>;
  classTargets: Array<{ classId: string; name: string }>;
  parts: ExamPart[];
};

export type ExamPage = {
  items: Exam[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type ExamQuery = {
  page?: number;
  limit?: number;
  courseOfferingId?: string;
  status?: ExamStatus;
  stage?: ExamStage;
  scope?: ExamScope;
  keyword?: string;
};

export type CreateExamInput = {
  courseOfferingId: string;
  sourceTemplateId?: string;
  title: string;
  description?: string;
  scope: ExamScope;
  stage: ExamStage;
  opensAt: string;
  closesAt: string;
};

export type UpdateExamInput = Partial<Omit<CreateExamInput, "courseOfferingId" | "sourceTemplateId">> & {
  subjectIds?: string[];
  classTargetIds?: string[];
};

export type ExamPartInput = {
  totalScore: number;
  passScore: number;
  opensAt: string;
  closesAt: string;
  instructions?: string;
  durationMinutes?: number;
  minFiles?: number;
  maxFiles?: number;
  maxTotalSizeBytes?: number;
};

export type ExamQuestionInput = {
  sourceQuestionId?: string;
  type?: QuestionType;
  prompt?: string;
  explanation?: string;
  options?: Array<{ content: string; isCorrect: boolean }>;
  acceptedAnswers?: string[];
  score: number;
};

export type ExamQuestionEntry = {
  id: string;
  courseOfferingSubjectId: string;
  sourceQuestionId: string | null;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  score: number;
  displayOrder: number;
  normalizationVersion: string | null;
  options: Array<{ id: string; content: string; displayOrder: number; isCorrect: boolean }>;
  acceptedAnswers: Array<{ id: string; answerText: string; normalizedAnswer: string }>;
};

export type ExamQuestionsResponse = {
  examId: string;
  partId: string;
  partTotalScore: number;
  assignedScoreSum: number;
  difference: number;
  questions: ExamQuestionEntry[];
};

export type ExamCriterionInput = { name: string; description?: string; maxScore: number };
export type ExamCriteriaResponse = {
  examId: string;
  partId: string;
  partTotalScore: number;
  assignedScoreSum: number;
  difference: number;
  criteria: Array<{ id: string; name: string; description: string | null; maxScore: number; displayOrder: number }>;
};

export type ExamScheduleValidationResult = {
  examId: string;
  valid: boolean;
  issues: Array<{
    code: string;
    part: ExamPartType | null;
    questionId: string | null;
    message: string;
  }>;
};

export type ExamTargetList = {
  examId: string;
  locked: boolean;
  lockedAt: string | null;
  targets: Array<{
    studentId: string;
    studentName: string;
    classId: string;
    className: string;
    enrollmentId: string;
    status: string;
    startedAt: string | null;
  }>;
};

export function getExams(query: ExamQuery = {}): Promise<ExamPage> {
  const params = new URLSearchParams({ page: String(query.page ?? 1), limit: String(query.limit ?? 20) });
  if (query.courseOfferingId) params.set("courseOfferingId", query.courseOfferingId);
  if (query.status) params.set("status", query.status);
  if (query.stage) params.set("stage", query.stage);
  if (query.scope) params.set("scope", query.scope);
  if (query.keyword) params.set("keyword", query.keyword);
  return apiRequest(`/exams?${params.toString()}`);
}

export function getExam(id: string): Promise<Exam> { return apiRequest(`/exams/${id}`); }
export function createExam(input: CreateExamInput): Promise<Exam> { return apiRequest("/exams", { method: "POST", body: input }); }
export function updateExam(id: string, input: UpdateExamInput): Promise<Exam> { return apiRequest(`/exams/${id}`, { method: "PATCH", body: input }); }
export function validateExam(id: string): Promise<ExamScheduleValidationResult> { return apiRequest(`/exams/${id}/validate`); }
export function scheduleExam(id: string): Promise<Exam> { return apiRequest(`/exams/${id}/schedule`, { method: "POST" }); }
export function cancelExam(id: string, reason: string): Promise<Exam> { return apiRequest(`/exams/${id}/cancel`, { method: "POST", body: { reason } }); }
export function getExamTargets(id: string): Promise<ExamTargetList> { return apiRequest(`/exams/${id}/targets`); }
export function rebuildExamTargets(id: string): Promise<ExamTargetList> { return apiRequest(`/exams/${id}/targets/rebuild`, { method: "POST" }); }
export function lockExamTargets(id: string): Promise<ExamTargetList> { return apiRequest(`/exams/${id}/targets/lock`, { method: "POST" }); }
export function addExamTarget(id: string, studentId: string): Promise<ExamTargetList> { return apiRequest(`/exams/${id}/targets`, { method: "POST", body: { studentId } }); }
export function removeExamTarget(id: string, studentId: string): Promise<ExamTargetList> { return apiRequest(`/exams/${id}/targets/${studentId}`, { method: "DELETE" }); }
export function saveExamPart(id: string, type: ExamPartType, input: ExamPartInput): Promise<Exam> { return apiRequest(`/exams/${id}/parts/${type}`, { method: "PUT", body: input }); }
export function deleteExamPart(id: string, type: ExamPartType): Promise<Exam> { return apiRequest(`/exams/${id}/parts/${type}`, { method: "DELETE" }); }
export function getExamQuestions(id: string): Promise<ExamQuestionsResponse> { return apiRequest(`/exams/${id}/parts/WRITTEN/questions`); }
export function replaceExamQuestions(id: string, questions: ExamQuestionInput[]): Promise<ExamQuestionsResponse> { return apiRequest(`/exams/${id}/parts/WRITTEN/questions`, { method: "PUT", body: { questions } }); }
export function getExamCriteria(id: string): Promise<ExamCriteriaResponse> { return apiRequest(`/exams/${id}/parts/PRACTICAL/criteria`); }
export function replaceExamCriteria(id: string, criteria: ExamCriterionInput[]): Promise<ExamCriteriaResponse> { return apiRequest(`/exams/${id}/parts/PRACTICAL/criteria`, { method: "PUT", body: { criteria } }); }
