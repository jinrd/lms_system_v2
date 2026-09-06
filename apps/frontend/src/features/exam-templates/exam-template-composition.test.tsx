import type { ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActivationPanel,
  PracticalCriteriaPanel,
  ValidationIssues,
  WrittenQuestionsPanel,
} from "./ExamTemplateComposerPage";
import type { ExamTemplate } from "./exam-templates.api";

const api = vi.hoisted(() => ({
  getWritten: vi.fn(),
  putWritten: vi.fn(),
  getCriteria: vi.fn(),
  putCriteria: vi.fn(),
  validate: vi.fn(),
  activate: vi.fn(),
  deactivate: vi.fn(),
  duplicate: vi.fn(),
  getQuestions: vi.fn(),
}));

vi.mock("./exam-template-composition.api", () => ({
  getTemplateWrittenQuestions: api.getWritten,
  replaceTemplateWrittenQuestions: api.putWritten,
  getTemplatePracticalCriteria: api.getCriteria,
  replaceTemplatePracticalCriteria: api.putCriteria,
  validateExamTemplate: api.validate,
  activateExamTemplate: api.activate,
  deactivateExamTemplate: api.deactivate,
  duplicateExamTemplate: api.duplicate,
}));
vi.mock("../questions/questions.api", () => ({
  getQuestions: api.getQuestions,
}));

function provider(element: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

const writtenPart = {
  id: "wp",
  type: "WRITTEN" as const,
  totalScore: 30,
  passScore: 18,
  durationMinutes: 60,
  defaultOpenOffsetDays: 0,
  defaultOpenDays: 7,
  minFiles: null,
  maxFiles: null,
  maxFileSizeBytes: null,
  maxTotalSizeBytes: null,
  instructions: null,
};
const practicalPart = {
  ...writtenPart,
  id: "pp",
  type: "PRACTICAL" as const,
  totalScore: 20,
  durationMinutes: null,
  minFiles: 1,
  maxFiles: 3,
  maxFileSizeBytes: 5_242_880,
  maxTotalSizeBytes: 31_457_280,
};
const template: ExamTemplate = {
  id: "t1",
  name: "피부 이론 정기 시험",
  description: null,
  scope: "SUBJECT",
  stage: "REGULAR",
  defaultOpenDays: 7,
  active: false,
  createdById: "admin",
  createdAt: "2026-09-06T00:00:00Z",
  updatedAt: "2026-09-06T00:00:00Z",
  subjects: [{ subjectId: "s1", name: "피부 이론", active: true }],
  parts: [writtenPart, practicalPart],
};

beforeEach(() => {
  api.getWritten.mockResolvedValue({
    templateId: "t1",
    partId: "wp",
    partTotalScore: 30,
    assignedScoreSum: 20,
    difference: -10,
    questions: [
      {
        id: "tq1",
        questionId: "q1",
        displayOrder: 0,
        score: 20,
        question: {
          id: "q1",
          subjectId: "s1",
          type: "SINGLE_CHOICE",
          prompt: "표피의 최외곽층은?",
          explanation: null,
          difficulty: "EASY",
          defaultScore: 10,
          active: true,
          options: [],
          acceptedAnswers: [],
        },
      },
    ],
  });
  api.putWritten.mockResolvedValue({
    templateId: "t1",
    partId: "wp",
    partTotalScore: 30,
    assignedScoreSum: 30,
    difference: 0,
    questions: [],
  });
  api.getCriteria.mockResolvedValue({
    templateId: "t1",
    partId: "pp",
    partTotalScore: 20,
    assignedScoreSum: 20,
    difference: 0,
    criteria: [
      {
        id: "c1",
        name: "위생",
        description: null,
        maxScore: 20,
        displayOrder: 0,
      },
    ],
  });
  api.putCriteria.mockResolvedValue({
    templateId: "t1",
    partId: "pp",
    partTotalScore: 20,
    assignedScoreSum: 20,
    difference: 0,
    criteria: [],
  });
  api.getQuestions.mockResolvedValue({
    items: [
      {
        id: "q2",
        subjectId: "s1",
        type: "SINGLE_CHOICE",
        prompt: "진피에 존재하는 섬유는?",
        explanation: null,
        defaultScore: 10,
        difficulty: "NORMAL",
        active: true,
        createdById: "admin",
        createdAt: "2026-09-06T00:00:00Z",
        updatedAt: "2026-09-06T00:00:00Z",
        options: [],
        acceptedAnswers: [],
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  api.validate.mockResolvedValue({ templateId: "t1", valid: true, issues: [] });
  api.activate.mockResolvedValue({ ...template, active: true });
  api.deactivate.mockResolvedValue(template);
  api.duplicate.mockResolvedValue({
    ...template,
    id: "t2",
    name: "피부 이론 정기 시험 (복제본)",
  });
});
afterEach(cleanup);

describe("시험 템플릿 구성 테스트 페이지", () => {
  it("필기 파트의 담긴 점수 합계와 총점 대비 차이를 보여준다", async () => {
    provider(<WrittenQuestionsPanel template={template} />);
    const summary = await screen.findByText(/총점 30점 \/ 담긴 점수 20점/);
    expect(summary.textContent).toContain("차이 -10점");
    expect(summary.textContent).toContain("서버 기준 20점, 차이 -10점");
  });

  it("문제를 추가하면 합계가 갱신되고 저장 시 전체 목록을 PUT 한다", async () => {
    provider(<WrittenQuestionsPanel template={template} />);
    fireEvent.click(await screen.findByRole("button", { name: "추가" }));
    // 20 + 10(defaultScore) = 30
    expect(screen.getByText(/담긴 점수 30점/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "문제 구성 저장" }));
    await waitFor(() => expect(api.putWritten).toHaveBeenCalledTimes(1));
    expect(api.putWritten).toHaveBeenCalledWith("t1", [
      { questionId: "q1", score: 20 },
      { questionId: "q2", score: 10 },
    ]);
  });

  it("실기 평가 항목을 추가·저장한다", async () => {
    provider(<PracticalCriteriaPanel template={template} />);
    await screen.findByDisplayValue("위생");
    fireEvent.click(screen.getByRole("button", { name: "평가 항목 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "평가 항목 저장" }));
    await waitFor(() => expect(api.putCriteria).toHaveBeenCalledTimes(1));
    expect(api.putCriteria).toHaveBeenCalledWith("t1", [
      { name: "위생", description: undefined, maxScore: 20 },
      { name: "", description: undefined, maxScore: 10 },
    ]);
  });

  it("활성 템플릿에서는 구성 저장 버튼이 비활성화된다", async () => {
    provider(
      <WrittenQuestionsPanel template={{ ...template, active: true }} />,
    );
    expect(
      await screen.findByText(/활성 템플릿의 구성은 변경할 수 없습니다/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "문제 구성 저장" }),
    ).toHaveProperty("disabled", true);
  });

  it("활성화 실패 시 서버가 준 사유 문자열을 노출한다", async () => {
    const { ApiError } = await import("../../lib/api-client");
    api.activate.mockRejectedValue(
      new ApiError(400, {
        code: "INVALID_REQUEST",
        message: "필기 파트 배점 합계가 20점으로 총점 30점과 다릅니다 (10점 부족).",
      }),
    );
    provider(<ActivationPanel template={template} />);
    fireEvent.click(screen.getByRole("button", { name: "활성화" }));
    expect(
      await screen.findByText(/10점 부족/),
    ).toBeTruthy();
  });

  it("검증 실패 결과를 항목별로 나열한다", () => {
    render(
      <ValidationIssues
        result={{
          templateId: "t1",
          valid: false,
          issues: [
            {
              code: "WRITTEN_SCORE_MISMATCH",
              part: "WRITTEN",
              questionId: null,
              message: "필기 파트 배점 합계가 20점으로 총점 30점과 다릅니다 (10점 부족).",
            },
            {
              code: "QUESTION_INACTIVE",
              part: "WRITTEN",
              questionId: "q9",
              message: "\"표피\" 문제가 비활성 상태입니다.",
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/검증 실패 \(2건\)/)).toBeTruthy();
    expect(screen.getByText(/WRITTEN_SCORE_MISMATCH/)).toBeTruthy();
    expect(screen.getByText(/QUESTION_INACTIVE/)).toBeTruthy();
  });
});
