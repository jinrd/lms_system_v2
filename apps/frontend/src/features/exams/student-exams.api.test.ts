import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api-client";
import {
  getMyExam,
  getMyExamResult,
  getMyExams,
  getMyWrittenQuestions,
  saveMyWrittenAnswer,
  startMyWrittenExam,
  submitMyWrittenExam,
} from "./student-exams.api";

vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn().mockResolvedValue({}) }));

describe("학생 시험 응시 API 계약", () => {
  it("목록·상세·시작·답안 저장·제출 경로를 맞춘다", async () => {
    await getMyExams();
    await getMyExam("e1");
    await getMyExamResult("e1");
    await startMyWrittenExam("e1");
    await getMyWrittenQuestions("e1");
    await saveMyWrittenAnswer("e1", "q1", { version: 2, selectedOptionIds: ["o1"] });
    await submitMyWrittenExam("e1");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/me/exams"],
      ["/me/exams/e1"],
      ["/me/exams/e1/result"],
      ["/me/exams/e1/parts/WRITTEN/start", { method: "POST" }],
      ["/me/exams/e1/parts/WRITTEN/questions"],
      ["/me/exams/e1/parts/WRITTEN/answers/q1", { method: "PUT", body: { version: 2, selectedOptionIds: ["o1"] } }],
      ["/me/exams/e1/parts/WRITTEN/submit", { method: "POST" }],
    ]);
  });
});
