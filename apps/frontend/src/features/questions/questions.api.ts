import { apiRequest } from "../../lib/api-client";

export type QuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "SHORT_ANSWER";

export type DifficultyLevel = "EASY" | "NORMAL" | "HARD";

export type QuestionOption = {
  id: string;
  content: string;
  displayOrder: number;
  isCorrect: boolean;
};

export type QuestionAcceptedAnswer = {
  id: string;
  answerText: string;
  normalizedAnswer: string;
  displayOrder: number;
};

export type Question = {
  id: string;
  subjectId: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  defaultScore: number;
  difficulty: DifficultyLevel;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
  acceptedAnswers: QuestionAcceptedAnswer[];
};

export type QuestionPage = {
  items: Question[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type QuestionOptionInput = {
  content: string;
  isCorrect: boolean;
};

export type QuestionInput = {
  subjectId: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
  defaultScore: number;
  difficulty: DifficultyLevel;
  options: QuestionOptionInput[];
  acceptedAnswers: string[];
};

export type QuestionQuery = {
  page?: number;
  limit?: number;
  subjectId?: string;
  type?: QuestionType;
  difficulty?: DifficultyLevel;
  active?: boolean;
  keyword?: string;
  createdByMe?: boolean;
};

export function getQuestions(query: QuestionQuery = {}): Promise<QuestionPage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 20),
  });

  if (query.subjectId) params.set("subjectId", query.subjectId);
  if (query.type) params.set("type", query.type);
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.active !== undefined) params.set("active", String(query.active));
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.createdByMe) params.set("createdByMe", "true");

  return apiRequest<QuestionPage>(`/questions?${params.toString()}`);
}

export function createQuestion(input: QuestionInput): Promise<Question> {
  return apiRequest<Question>("/questions", {
    method: "POST",
    body: { ...input, active: true },
  });
}

export function updateQuestion(
  id: string,
  input: QuestionInput,
): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function changeQuestionActive(
  id: string,
  active: boolean,
): Promise<Question> {
  return apiRequest<Question>(`/questions/${id}/active`, {
    method: "PATCH",
    body: {
      active,
      reason: active ? "문제 출제 재개" : "문제 출제 중지",
    },
  });
}
