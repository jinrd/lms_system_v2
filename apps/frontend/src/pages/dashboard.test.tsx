import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./index";

vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "ADMIN", name: "관리자" } }) }));

const api = vi.hoisted(() => ({
  users: vi.fn(),
  classes: vi.fn(),
  sessions: vi.fn(),
  inquiries: vi.fn(),
  notices: vi.fn(),
  exams: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("../features/users/users.api", () => ({ getUsers: api.users }));
vi.mock("../features/classes/class-management.api", () => ({
  getManagedClasses: api.classes,
  getClassSessions: api.sessions,
  getInstructorClasses: vi.fn(),
}));
vi.mock("../features/communications/communications.api", () => ({
  getInquiries: api.inquiries,
  getNotices: api.notices,
  getMyNotices: vi.fn(),
}));
vi.mock("../features/exams/exams.api", () => ({ getExams: api.exams }));
vi.mock("../features/operations/operations.api", () => ({ getAuditLogs: api.audit }));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  api.users.mockResolvedValue({ pagination: { total: 0 } });
  api.classes.mockResolvedValue({ items: [] });
  api.sessions.mockResolvedValue([]);
  api.inquiries.mockResolvedValue({ items: [], pagination: { total: 0 } });
  api.notices.mockResolvedValue({ items: [], pagination: { total: 0 } });
  api.exams.mockResolvedValue({ items: [], pagination: { total: 0 } });
  api.audit.mockResolvedValue({ items: [], pagination: { total: 0 } });
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("대시보드", () => {
  it("시안의 인사말과 네 개 업무 영역을 표시한다", () => {
    api.classes.mockImplementation(() => new Promise(() => undefined));
    api.users.mockImplementation(() => new Promise(() => undefined));
    api.inquiries.mockImplementation(() => new Promise(() => undefined));
    api.notices.mockImplementation(() => new Promise(() => undefined));
    api.exams.mockImplementation(() => new Promise(() => undefined));
    api.audit.mockImplementation(() => new Promise(() => undefined));
    show();

    expect(screen.getByRole("heading", { name: "안녕하세요, 관리자님!" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "오늘의 일정" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "긴급한 일" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "최근 공지사항" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "최근 활동" })).toBeTruthy();
    expect(screen.queryByText("오늘의 운영 현황")).toBeNull();
    expect(screen.queryByText("빠른 업무")).toBeNull();
  });

  it("실제 조회 결과를 긴급 업무와 공지 및 활동에 연결한다", async () => {
    api.users.mockResolvedValue({ pagination: { total: 3 } });
    api.inquiries.mockResolvedValue({
      items: [{ id: "inquiry-1", title: "수업 시간 문의", className: "A반", replyCount: 0, status: "RECEIVED", updatedAt: new Date().toISOString() }],
      pagination: { total: 1 },
    });
    api.notices.mockResolvedValue({
      items: [{ id: "notice-1", title: "10월 모의고사 시행 안내", important: true, createdAt: new Date().toISOString() }],
      pagination: { total: 1 },
    });
    api.audit.mockResolvedValue({
      items: [{ id: "audit-1", actorName: "관리자", action: "NOTICE_UPDATED", result: "SUCCESS", createdAt: new Date().toISOString() }],
      pagination: { total: 1 },
    });
    show();

    expect(await screen.findByText("가입 승인 대기 학생 3명")).toBeTruthy();
    expect(await screen.findByText("수업 시간 문의")).toBeTruthy();
    expect(await screen.findByText("10월 모의고사 시행 안내")).toBeTruthy();
    expect(await screen.findByText("관리자님이 공지사항을 수정했습니다.")).toBeTruthy();
  });

  it("업무가 없으면 각 영역에 간결한 빈 상태를 표시한다", async () => {
    show();
    expect(await screen.findByText("오늘 예정된 수업이 없습니다.")).toBeTruthy();
    expect(await screen.findByText("지금 바로 확인할 긴급 업무가 없습니다.")).toBeTruthy();
    expect(await screen.findByText("등록된 공지사항이 없습니다.")).toBeTruthy();
    expect(await screen.findByText("최근 활동이 없습니다.")).toBeTruthy();
  });
});
