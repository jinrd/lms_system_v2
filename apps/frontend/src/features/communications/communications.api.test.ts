import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api-client";
import {
  acknowledgeHandover,
  closeInquiry,
  createHandover,
  createInquiry,
  createNotice,
  deleteNotice,
  getHandovers,
  getInquiries,
  getMyNotice,
  getMyNotices,
  getNotices,
  getUnreadNoticeCount,
  replyInquiry,
  updateHandover,
  updateNotice,
} from "./communications.api";

vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn().mockResolvedValue({}) }));

beforeEach(() => vi.mocked(apiRequest).mockClear());

describe("소통 API 계약", () => {
  it("수신 공지와 공지 관리 경로를 맞춘다", async () => {
    await getMyNotices({ page: 2, important: true });
    await getUnreadNoticeCount();
    await getMyNotice("n1");
    await getNotices({ keyword: "휴강", type: "STUDENT", scope: "CLASSES" });
    await createNotice({ type: "STUDENT", scope: "ALL", title: "공지", content: "내용" });
    await updateNotice("n1", { title: "수정" });
    await deleteNotice("n1");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/me/notices?page=2&limit=20&important=true"],
      ["/me/notices/unread-count"],
      ["/me/notices/n1"],
      ["/notices?page=1&limit=20&keyword=%ED%9C%B4%EA%B0%95&type=STUDENT&scope=CLASSES"],
      ["/notices", { method: "POST", body: { type: "STUDENT", scope: "ALL", title: "공지", content: "내용" } }],
      ["/notices/n1", { method: "PATCH", body: { title: "수정" } }],
      ["/notices/n1", { method: "DELETE" }],
    ]);
  });

  it("문의 대화와 종료 경로를 맞춘다", async () => {
    await getInquiries({ page: 2, status: "RECEIVED" });
    await createInquiry({ type: "GENERAL", title: "문의", content: "내용" });
    await replyInquiry("i1", "답변");
    await closeInquiry("i1");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/inquiries?page=2&limit=20&status=RECEIVED"],
      ["/inquiries", { method: "POST", body: { type: "GENERAL", title: "문의", content: "내용" } }],
      ["/inquiries/i1/replies", { method: "POST", body: { content: "답변" } }],
      ["/inquiries/i1/close", { method: "POST" }],
    ]);
  });

  it("인수인계 생성·수정·확인 경로를 맞춘다", async () => {
    await getHandovers({ acknowledged: false });
    await createHandover({ classId: "c1", toInstructorId: "u2", title: "인계", content: "내용" });
    await updateHandover("h1", { title: "수정" });
    await acknowledgeHandover("h1");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/handovers?page=1&limit=20&acknowledged=false"],
      ["/handovers", { method: "POST", body: { classId: "c1", toInstructorId: "u2", title: "인계", content: "내용" } }],
      ["/handovers/h1", { method: "PATCH", body: { title: "수정" } }],
      ["/handovers/h1/acknowledge", { method: "POST" }],
    ]);
  });
});
