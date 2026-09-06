import { describe, expect, it, vi } from "vitest";
import {
  createExamTemplate,
  deleteExamTemplatePart,
  getExamTemplate,
  getExamTemplates,
  saveExamTemplatePart,
  updateExamTemplate,
} from "./exam-templates.api";
import { apiRequest } from "../../lib/api-client";
vi.mock("../../lib/api-client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));
describe("시험 템플릿 API 계약", () => {
  it("초안 false 필터와 페이지·범위·단계·검색어를 직렬화한다", async () => {
    await getExamTemplates({
      page: 2,
      limit: 20,
      active: false,
      scope: "SUBJECT",
      stage: "MIDTERM",
      keyword: "커트 평가",
    });
    const [path] = vi.mocked(apiRequest).mock.calls[0];
    const url = new URL(path, "http://localhost");
    expect(url.pathname).toBe("/exam-templates");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      limit: "20",
      active: "false",
      scope: "SUBJECT",
      stage: "MIDTERM",
      keyword: "커트 평가",
    });
  });
  it("상세·생성·수정·파트 저장·삭제의 메서드와 본문을 맞춘다", async () => {
    const input = {
      name: "커트 평가",
      scope: "SUBJECT" as const,
      stage: "REGULAR" as const,
      subjectIds: ["subject"],
    };
    const part = {
      totalScore: 100,
      passScore: 60,
      defaultOpenOffsetDays: 0,
      defaultOpenDays: 7,
      durationMinutes: 60,
    };
    await getExamTemplate("id");
    await createExamTemplate(input);
    await updateExamTemplate("id", { name: "수정" });
    await saveExamTemplatePart("id", "WRITTEN", part);
    await deleteExamTemplatePart("id", "PRACTICAL");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/exam-templates/id"],
      ["/exam-templates", { method: "POST", body: input }],
      ["/exam-templates/id", { method: "PATCH", body: { name: "수정" } }],
      ["/exam-templates/id/parts/WRITTEN", { method: "PUT", body: part }],
      ["/exam-templates/id/parts/PRACTICAL", { method: "DELETE" }],
    ]);
  });
});
