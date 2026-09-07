import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./index";

vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { role: "ADMIN" } }) }));
const api = vi.hoisted(() => ({ users: vi.fn(), classes: vi.fn(), programs: vi.fn() }));
vi.mock("../features/users/users.api", () => ({ getUsers: api.users }));
vi.mock("../features/classes/class-management.api", () => ({ getManagedClasses: api.classes, getInstructorClasses: vi.fn() }));
vi.mock("../features/courses/programs.api", () => ({ getPrograms: api.programs }));
afterEach(cleanup);
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
}
describe("운영 현황", () => {
  it("조회 중인 반을 0으로 표시하지 않는다", () => {
    api.users.mockImplementation(() => new Promise(() => {}));
    api.classes.mockImplementation(() => new Promise(() => {}));
    api.programs.mockImplementation(() => new Promise(() => {}));
    show();
    expect(screen.getAllByText("불러오는 중")).toHaveLength(4);
    expect(screen.queryByText("0")).toBeNull();
  });
  it("실패한 조회를 다시 시도하고 정상 결과로 복구한다", async () => {
    api.users.mockResolvedValue({ pagination: { total: 0 } });
    api.programs.mockResolvedValue({ pagination: { total: 2 } });
    api.classes.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [{ derivedStatus: "OPERATING" }] });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "운영 중 반 다시 시도" }));
    expect(await screen.findByText("전체 1개 반")).toBeTruthy();
    expect(screen.queryByText("조회 실패")).toBeNull();
  });
  it("승인 대기가 있을 때만 우선 업무를 보여준다", async () => {
    api.users.mockResolvedValue({ pagination: { total: 3 } });
    api.classes.mockResolvedValue({ items: [] });
    api.programs.mockResolvedValue({ pagination: { total: 0 } });
    show();
    expect(await screen.findByRole("heading", { name: "가입 승인 대기 학생이 3명 있습니다" })).toBeTruthy();
  });
});
