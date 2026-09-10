import type { UserRole } from "../../auth/auth.types";
import { apiRequest } from "../../lib/api-client";

type Paginated<T> = {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  result: "SUCCESS" | "FAILURE";
  errorCode: string | null;
  ipAddress: string | null;
  requestId: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: string;
};

export type SystemLog = {
  id: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  errorCode: string | null;
  stack: string | null;
  userId: string | null;
  route: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type LifecycleJobType =
  | "AUDIT_LOG_RETENTION"
  | "SYSTEM_LOG_RETENTION"
  | "ATTENDANCE_CODE_ATTEMPT_RETENTION"
  | "REJECTED_SIGNUP_PURGE"
  | "ACCOUNT_ANONYMIZATION"
  | "FILE_RETENTION";

export type LifecycleRun = {
  id: string;
  jobType: LifecycleJobType;
  status: "RUNNING" | "SUCCESS" | "PARTIAL_FAILURE" | "FAILURE";
  startedAt: string;
  finishedAt: string | null;
  scannedCount: number;
  successCount: number;
  failureCount: number;
  lastCursor: string | null;
  errorSummary: string | null;
};

export type BackupRun = {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILURE";
  startedAt: string;
  finishedAt: string | null;
  storageKey: string | null;
  sizeBytes: string | null;
  checksum: string | null;
  retentionUntil: string | null;
  errorMessage: string | null;
  restoreTestedAt: string | null;
  restoreTestResult: "SUCCESS" | "FAILURE" | null;
};

function pagedPath(path: string, input: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== "") params.set(key, String(value));
  if (!params.has("page")) params.set("page", "1");
  if (!params.has("limit")) params.set("limit", "20");
  return `${path}?${params.toString()}`;
}

export function getAuditLogs(input: { page?: number; action?: string; resourceType?: string; result?: string } = {}): Promise<Paginated<AuditLog>> {
  return apiRequest(pagedPath("/admin/audit-logs", input));
}

export function getSystemLogs(input: { page?: number; level?: string; errorCode?: string; route?: string } = {}): Promise<Paginated<SystemLog>> {
  return apiRequest(pagedPath("/admin/system-logs", input));
}

export function getLifecycleRuns(input: { page?: number; jobType?: string; status?: string } = {}): Promise<Paginated<LifecycleRun>> {
  return apiRequest(pagedPath("/admin/data-lifecycle/runs", input));
}

export function runDataLifecycle(): Promise<{ ran: boolean; jobs: Array<{ jobType: LifecycleJobType; status: string }> }> {
  return apiRequest("/admin/data-lifecycle/run", { method: "POST" });
}

export function getBackupRuns(input: { page?: number; status?: string } = {}): Promise<Paginated<BackupRun>> {
  return apiRequest(pagedPath("/admin/backups", input));
}

export function recordRestoreTest(id: string, result: "SUCCESS" | "FAILURE"): Promise<BackupRun> {
  return apiRequest(`/admin/backups/${id}/restore-test`, { method: "POST", body: { result } });
}
