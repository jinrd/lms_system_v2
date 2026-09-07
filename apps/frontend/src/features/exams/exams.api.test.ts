import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api-client";
import {
  createExam,
  addExamTarget,
  cancelExam,
  deleteExamPart,
  getExam,
  getExamCriteria,
  getExamQuestions,
  getExamTargets,
  getExams,
  replaceExamCriteria,
  rebuildExamTargets,
  replaceExamQuestions,
  removeExamTarget,
  scheduleExam,
  saveExamPart,
  lockExamTargets,
  updateExam,
  validateExam,
} from "./exams.api";

vi.mock("../../lib/api-client", () => ({
  apiRequest: vi.fn().mockResolvedValue({}),
}));

describe("실제 시험 API 계약", () => {
  it("목록 필터와 기본 CRUD 경로를 맞춘다", async () => {
    await getExams({ page: 2, limit: 10, status: "DRAFT", keyword: "중간" });
    await getExam("e1");
    await createExam({
      courseOfferingId: "p1",
      sourceTemplateId: "t1",
      title: "중간 평가",
      scope: "SUBJECT",
      stage: "MIDTERM",
      opensAt: "2026-09-10T00:00:00.000Z",
      closesAt: "2026-09-11T00:00:00.000Z",
    });
    await updateExam("e1", { title: "수정 평가", classTargetIds: ["c1"] });

    const calls = vi.mocked(apiRequest).mock.calls;
    const listUrl = new URL(String(calls[0][0]), "https://example.test");
    expect(listUrl.pathname).toBe("/exams");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      page: "2",
      limit: "10",
      status: "DRAFT",
      keyword: "중간",
    });
    expect(calls.slice(1)).toEqual([
      ["/exams/e1"],
      [
        "/exams",
        {
          method: "POST",
          body: {
            courseOfferingId: "p1",
            sourceTemplateId: "t1",
            title: "중간 평가",
            scope: "SUBJECT",
            stage: "MIDTERM",
            opensAt: "2026-09-10T00:00:00.000Z",
            closesAt: "2026-09-11T00:00:00.000Z",
          },
        },
      ],
      [
        "/exams/e1",
        { method: "PATCH", body: { title: "수정 평가", classTargetIds: ["c1"] } },
      ],
    ]);
  });

  it("파트·문제·평가 기준의 전체 교체 경로를 맞춘다", async () => {
    vi.mocked(apiRequest).mockClear();
    await saveExamPart("e1", "WRITTEN", {
      totalScore: 100,
      passScore: 60,
      opensAt: "2026-09-10T00:00:00.000Z",
      closesAt: "2026-09-11T00:00:00.000Z",
      durationMinutes: 60,
    });
    await deleteExamPart("e1", "PRACTICAL");
    await getExamQuestions("e1");
    await replaceExamQuestions("e1", [{ sourceQuestionId: "q1", score: 20 }]);
    await getExamCriteria("e1");
    await replaceExamCriteria("e1", [{ name: "위생", maxScore: 20 }]);

    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      [
        "/exams/e1/parts/WRITTEN",
        {
          method: "PUT",
          body: {
            totalScore: 100,
            passScore: 60,
            opensAt: "2026-09-10T00:00:00.000Z",
            closesAt: "2026-09-11T00:00:00.000Z",
            durationMinutes: 60,
          },
        },
      ],
      ["/exams/e1/parts/PRACTICAL", { method: "DELETE" }],
      ["/exams/e1/parts/WRITTEN/questions"],
      [
        "/exams/e1/parts/WRITTEN/questions",
        { method: "PUT", body: { questions: [{ sourceQuestionId: "q1", score: 20 }] } },
      ],
      ["/exams/e1/parts/PRACTICAL/criteria"],
      [
        "/exams/e1/parts/PRACTICAL/criteria",
        { method: "PUT", body: { criteria: [{ name: "위생", maxScore: 20 }] } },
      ],
    ]);
  });

  it("검증·예약·취소의 메서드와 본문을 맞춘다", async () => {
    vi.mocked(apiRequest).mockClear();
    await validateExam("e1");
    await scheduleExam("e1");
    await cancelExam("e1", "일정 변경");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/exams/e1/validate"],
      ["/exams/e1/schedule", { method: "POST" }],
      ["/exams/e1/cancel", { method: "POST", body: { reason: "일정 변경" } }],
    ]);
  });

  it("응시 대상 명단의 조회·재생성·확정·수동 편집 경로를 맞춘다", async () => {
    vi.mocked(apiRequest).mockClear();
    await getExamTargets("e1");
    await rebuildExamTargets("e1");
    await lockExamTargets("e1");
    await addExamTarget("e1", "s1");
    await removeExamTarget("e1", "s1");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/exams/e1/targets"],
      ["/exams/e1/targets/rebuild", { method: "POST" }],
      ["/exams/e1/targets/lock", { method: "POST" }],
      ["/exams/e1/targets", { method: "POST", body: { studentId: "s1" } }],
      ["/exams/e1/targets/s1", { method: "DELETE" }],
    ]);
  });
});
