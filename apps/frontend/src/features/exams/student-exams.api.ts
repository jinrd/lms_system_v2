import { apiRequest } from "../../lib/api-client";
import type { ExamStatus } from "./exams.api";
import type { QuestionType } from "../questions/questions.api";

export type MyExamSummary = {
  examId: string;
  title: string;
  scope: string;
  stage: string;
  status: ExamStatus;
  opensAt: string;
  closesAt: string;
  written: {
    partId: string;
    opensAt: string;
    closesAt: string;
    durationMinutes: number;
    submissionStatus: string | null;
    deadlineAt: string | null;
  } | null;
};

export type MyWrittenQuestion = {
  examQuestionId: string;
  type: QuestionType;
  prompt: string;
  score: number;
  displayOrder: number;
  options: Array<{
    examQuestionOptionId: string;
    content: string;
    displayOrder: number;
  }>;
  answer: {
    subjectiveText: string | null;
    selectedOptionIds: string[];
    version: number;
    savedAt: string | null;
  } | null;
};

export type MyWrittenQuestions = {
  examId: string;
  partId: string;
  submissionStatus: string;
  deadlineAt: string;
  questions: MyWrittenQuestion[];
};

export type SaveAnswerInput = {
  version: number;
  subjectiveText?: string;
  selectedOptionIds?: string[];
};

export type SaveAnswerResponse = {
  examQuestionId: string;
  version: number;
  savedAt: string;
};

export function getMyExams(): Promise<MyExamSummary[]> {
  return apiRequest("/me/exams");
}

export function getMyExam(id: string): Promise<MyExamSummary> {
  return apiRequest(`/me/exams/${id}`);
}

export function startMyWrittenExam(id: string): Promise<MyWrittenQuestions> {
  return apiRequest(`/me/exams/${id}/parts/WRITTEN/start`, { method: "POST" });
}

export function getMyWrittenQuestions(id: string): Promise<MyWrittenQuestions> {
  return apiRequest(`/me/exams/${id}/parts/WRITTEN/questions`);
}

export function saveMyWrittenAnswer(id: string, questionId: string, input: SaveAnswerInput): Promise<SaveAnswerResponse> {
  return apiRequest(`/me/exams/${id}/parts/WRITTEN/answers/${questionId}`, { method: "PUT", body: input });
}

export function submitMyWrittenExam(id: string): Promise<MyWrittenQuestions> {
  return apiRequest(`/me/exams/${id}/parts/WRITTEN/submit`, { method: "POST" });
}
