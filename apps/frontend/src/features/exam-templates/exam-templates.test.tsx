import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExamTemplatesPage, TemplateDetail } from "./ExamTemplatesPage";
import { PartEditor, TemplateEditor } from "./ExamTemplateForms";
import {
  MIB,
  templateUpdate,
  validatePart,
  validateTemplate,
} from "./exam-template.utils";
import type { ExamTemplate } from "./exam-templates.api";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  savePart: vi.fn(),
  deletePart: vi.fn(),
}));
vi.mock("./exam-templates.api", () => ({
  getExamTemplates: api.list,
  getExamTemplate: api.detail,
  createExamTemplate: api.create,
  updateExamTemplate: api.update,
  saveExamTemplatePart: api.savePart,
  deleteExamTemplatePart: api.deletePart,
}));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "instructor", role: "INSTRUCTOR" } }),
}));
vi.mock("../education/education.api", () => ({
  getEducationFields: async () => [{ id: "field", name: "미용", active: true }],
  getSubjects: async () => [{ id: "subject", name: "커트", active: true }],
}));
const template: ExamTemplate = {
  id: "template",
  name: "커트 중간 평가",
  description: null,
  scope: "SUBJECT",
  stage: "MIDTERM",
  defaultOpenDays: null,
  active: false,
  createdById: "instructor",
  createdAt: "2026-09-06T00:00:00Z",
  updatedAt: "2026-09-06T00:00:00Z",
  subjects: [{ subjectId: "subject", name: "커트", active: true }],
  parts: [],
};
const common = {
  totalScore: 100,
  passScore: 60,
  defaultOpenOffsetDays: 0,
  defaultOpenDays: 7,
};
const pageData = {
  items: [template],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};
function provider(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}
function page() {
  const router = createMemoryRouter([
    { path: "/", element: <ExamTemplatesPage /> },
    { path: "/elsewhere", element: <p>다른 화면</p> },
  ]);
  provider(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => {
  api.list.mockResolvedValue(pageData);
  api.detail.mockResolvedValue(template);
  api.create.mockResolvedValue({ ...template, id: "created" });
  api.update.mockResolvedValue(template);
  api.savePart.mockResolvedValue(template);
  api.deletePart.mockResolvedValue(template);
});
afterEach(cleanup);

describe("시험 템플릿", () => {
  it("활성 템플릿은 수정·파트 추가·삭제 동작을 제공하지 않는다", () => {
    render(
      <TemplateDetail
        template={{ ...template, active: true }}
        onEdit={vi.fn()}
        onPart={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/활성 템플릿은 읽기 전용/)).toBeTruthy();
  });
  it("과목 개수 규칙을 검증하고 변경 없는 과목은 수정 요청에서 제외한다", () => {
    const input = {
      name: "수정",
      scope: template.scope,
      stage: template.stage,
      subjectIds: ["subject"],
    };
    expect(validateTemplate({ ...input, subjectIds: [] })).toContain(
      "정확히 1개",
    );
    expect(validateTemplate({ ...input, subjectIds: ["a", "b"] })).toContain(
      "정확히 1개",
    );
    expect(templateUpdate(input, template)).toEqual({
      name: "수정",
      stage: "MIDTERM",
    });
    expect(
      templateUpdate({ ...input, subjectIds: ["other"] }, template).subjectIds,
    ).toEqual(["other"]);
  });
  it("이름과 과목을 입력하여 초안을 생성하고 상세를 유지한다", async () => {
    api.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    page();
    fireEvent.click(screen.getByRole("button", { name: "새 템플릿" }));
    fireEvent.change(
      screen.getByLabelText(/템플릿 이름/, { selector: "input[name='name']" }),
      { target: { value: "새 평가" } },
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: /커트/ }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "새 평가",
          scope: "SUBJECT",
          subjectIds: ["subject"],
        }),
      ),
    );
    expect(await screen.findByText(/초안을 만들었습니다/)).toBeTruthy();
    expect(api.detail).toHaveBeenCalledTimes(0);
  });
  it("실기 파일당 크기는 5 MiB로 고정해 보내고 필기 제한 시간을 보내지 않는다", () => {
    const submit = vi.fn();
    render(
      <PartEditor
        type="PRACTICAL"
        pending={false}
        error={null}
        onDirty={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={submit}
      />,
    );
    expect(screen.queryByLabelText("파일당 최대 크기 (MiB)")).toBeNull();
    expect(screen.getByDisplayValue("5 MiB 고정")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("전체 최대 크기 (MiB)"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "실기 파트 저장" }));
    expect(submit).toHaveBeenCalledWith({
      ...common,
      instructions: "",
      minFiles: 1,
      maxFiles: 5,
      maxFileSizeBytes: 5 * MIB,
      maxTotalSizeBytes: 25 * MIB,
    });
  });
  it("합격 점수와 파일 개수의 모순을 저장 전에 차단한다", () => {
    expect(
      validatePart({ ...common, durationMinutes: 60, passScore: 101 }),
    ).toContain("총점보다");
    expect(
      validatePart({
        ...common,
        minFiles: 5,
        maxFiles: 2,
        maxFileSizeBytes: MIB,
        maxTotalSizeBytes: MIB,
      }),
    ).toContain("최대 제출 파일 수");
    expect(validatePart({ ...common, durationMinutes: 0 })).toContain("1~1440");
    const submit = vi.fn();
    render(
      <PartEditor
        type="WRITTEN"
        pending={false}
        error={null}
        onDirty={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={submit}
      />,
    );
    fireEvent.change(screen.getByLabelText("합격 점수"), {
      target: { value: "101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "필기 파트 저장" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "합격 점수는 총점보다",
    );
    expect(submit).not.toHaveBeenCalled();
  });
  it("저장 실패 시 작성 내용을 보존하고 재시도한다", async () => {
    api.create.mockRejectedValueOnce(new Error("담당하지 않는 과목입니다."));
    page();
    fireEvent.click(screen.getByRole("button", { name: "새 템플릿" }));
    const name = screen.getByLabelText(/템플릿 이름/, {
      selector: "input[name='name']",
    }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "작성 중" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: /커트/ }));
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "담당하지 않는 과목입니다.",
    );
    expect(name.value).toBe("작성 중");
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    expect(await screen.findByText(/초안을 만들었습니다/)).toBeTruthy();
  });
  it("입력 중 취소 시 확인하고 계속 편집하면 내용을 보존한다", async () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "새 템플릿" }));
    fireEvent.change(
      screen.getByLabelText(/템플릿 이름/, { selector: "input[name='name']" }),
      { target: { value: "작성 중" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      (
        screen.getByLabelText(/템플릿 이름/, {
          selector: "input[name='name']",
        }) as HTMLInputElement
      ).value,
    ).toBe("작성 중");
  });
  it("파트 삭제를 확인한 후에만 삭제 API를 호출한다", async () => {
    api.detail.mockResolvedValue({
      ...template,
      parts: [
        {
          ...common,
          id: "part",
          type: "WRITTEN",
          durationMinutes: 60,
          minFiles: null,
          maxFiles: null,
          maxFileSizeBytes: null,
          maxTotalSizeBytes: null,
          instructions: null,
        },
      ],
    });
    page();
    fireEvent.click(
      await screen.findByRole("button", { name: "필기 파트 삭제" }),
    );
    expect(api.deletePart).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "파트 삭제",
      }),
    );
    await waitFor(() =>
      expect(api.deletePart).toHaveBeenCalledWith("template", "WRITTEN"),
    );
    expect(await screen.findByText("필기 파트를 삭제했습니다.")).toBeTruthy();
  });
  it("기존 응시 기간과 비활성 과목을 편집 폼에서 보존한다", async () => {
    provider(
      <TemplateEditor
        template={{
          ...template,
          defaultOpenDays: 14,
          subjects: [{ subjectId: "old", name: "기존 과목", active: false }],
        }}
        pending={false}
        error={null}
        onDirty={vi.fn()}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(
      (screen.getByLabelText(/^기본 응시 기간 \(일\)/) as HTMLInputElement)
        .value,
    ).toBe("14");
    expect(
      (screen.getByRole("checkbox", { name: /기존 과목/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});
