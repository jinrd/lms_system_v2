import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api-client";
import {
  activateExamTemplate,
  deactivateExamTemplate,
  duplicateExamTemplate,
  getTemplatePracticalCriteria,
  getTemplateWrittenQuestions,
  replaceTemplatePracticalCriteria,
  replaceTemplateWrittenQuestions,
  validateExamTemplate,
} from "./exam-template-composition.api";

vi.mock("../../lib/api-client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

describe("시험 템플릿 구성·활성화 API 계약", () => {
  it("파트 구성 조회·저장의 경로와 본문을 맞춘다", async () => {
    await getTemplateWrittenQuestions("t1");
    await replaceTemplateWrittenQuestions("t1", [
      { questionId: "q1", score: 10 },
      { questionId: "q2", score: 20 },
    ]);
    await getTemplatePracticalCriteria("t1");
    await replaceTemplatePracticalCriteria("t1", [
      { name: "위생", maxScore: 10 },
      { name: "정확도", description: "범위와 강도", maxScore: 10 },
    ]);

    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/exam-templates/t1/parts/WRITTEN/questions"],
      [
        "/exam-templates/t1/parts/WRITTEN/questions",
        {
          method: "PUT",
          body: {
            questions: [
              { questionId: "q1", score: 10 },
              { questionId: "q2", score: 20 },
            ],
          },
        },
      ],
      ["/exam-templates/t1/parts/PRACTICAL/criteria"],
      [
        "/exam-templates/t1/parts/PRACTICAL/criteria",
        {
          method: "PUT",
          body: {
            criteria: [
              { name: "위생", maxScore: 10 },
              { name: "정확도", description: "범위와 강도", maxScore: 10 },
            ],
          },
        },
      ],
    ]);
  });

  it("검증·활성화·비활성화·복제의 메서드를 맞춘다", async () => {
    await validateExamTemplate("t1");
    await activateExamTemplate("t1");
    await deactivateExamTemplate("t1");
    await duplicateExamTemplate("t1");

    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/exam-templates/t1/validate"],
      ["/exam-templates/t1/activate", { method: "POST" }],
      ["/exam-templates/t1/deactivate", { method: "POST" }],
      ["/exam-templates/t1/duplicate", { method: "POST" }],
    ]);
  });
});
