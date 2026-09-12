import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api-client";
import { getAuditLogs, getBackupRuns, getLifecycleRuns, getSystemLogs, recordRestoreTest, runDataLifecycle } from "./operations.api";

vi.mock("../../lib/api-client", () => ({ apiRequest: vi.fn().mockResolvedValue({}) }));

beforeEach(() => vi.mocked(apiRequest).mockClear());

describe("시스템 운영 API 계약", () => {
  it("로그와 실행 이력을 조회한다", async () => {
    await getAuditLogs({ page: 2, result: "FAILURE" });
    await getSystemLogs({ level: "ERROR", route: "/exams" });
    await getLifecycleRuns({ status: "SUCCESS" });
    await getBackupRuns({ status: "SUCCESS" });
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/admin/audit-logs?page=2&result=FAILURE&limit=20"],
      ["/admin/system-logs?level=ERROR&route=%2Fexams&page=1&limit=20"],
      ["/admin/data-lifecycle/runs?status=SUCCESS&page=1&limit=20"],
      ["/admin/backups?status=SUCCESS&page=1&limit=20"],
    ]);
  });

  it("관리자 작업 경로를 맞춘다", async () => {
    await runDataLifecycle();
    await recordRestoreTest("b1", "SUCCESS");
    expect(vi.mocked(apiRequest).mock.calls).toEqual([
      ["/admin/data-lifecycle/run", { method: "POST" }],
      ["/admin/backups/b1/restore-test", { method: "POST", body: { result: "SUCCESS" } }],
    ]);
  });
});
