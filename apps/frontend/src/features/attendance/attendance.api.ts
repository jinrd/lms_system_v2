import { apiRequest } from "../../lib/api-client";
import type { SessionStatus } from "../classes/class-management.api";

export type AttendanceStatus =
  "UNPROCESSED" | "PRESENT" | "LATE" | "ABSENT" | "EARLY_LEAVE" | "EXCUSED";

export type AttendanceMethod =
  | "SYSTEM_AUTO"
  | "CODE"
  | "INSTRUCTOR_MANUAL"
  | "MANAGER_MANUAL"
  | "PRINCIPAL_MANUAL"
  | "ADMIN_MANUAL";

export type AttendanceCodeMetadata = {
  id: string;
  classSessionId: string;
  generatedBy: {
    id: string;
    name: string;
  };
  generatedAt: string;
  expiresAt: string;
};

export type AttendanceCodeGeneration = AttendanceCodeMetadata & {
  code: string;
};

export type StudentAttendanceSession = {
  id: string;
  classId: string;
  className: string;
  courseOfferingId: string;
  courseOfferingName: string;
  subjectName: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: SessionStatus;
  codeAvailable: boolean;
  attendance: {
    id: string;
    status: AttendanceStatus;
    method: AttendanceMethod | null;
    checkedAt: string | null;
  } | null;
};

export type AttendanceSubmission = {
  attendanceRecordId: string;
  classSessionId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  checkedAt: string;
};

function attendanceCodePath(classId: string, sessionId: string): string {
  return `/classes/${classId}/sessions/${sessionId}/attendance-code`;
}

export function getCurrentAttendanceCode(
  classId: string,
  sessionId: string,
): Promise<AttendanceCodeMetadata | null> {
  return apiRequest<AttendanceCodeMetadata | null>(
    attendanceCodePath(classId, sessionId),
  );
}

export function generateAttendanceCode(
  classId: string,
  sessionId: string,
): Promise<AttendanceCodeGeneration> {
  return apiRequest<AttendanceCodeGeneration>(
    attendanceCodePath(classId, sessionId),
    { method: "POST" },
  );
}

export function getMyAttendanceSessions(): Promise<StudentAttendanceSession[]> {
  return apiRequest<StudentAttendanceSession[]>("/attendance/my-sessions");
}

export function submitAttendanceCode(
  classSessionId: string,
  code: string,
): Promise<AttendanceSubmission> {
  return apiRequest<AttendanceSubmission>("/attendance/code", {
    method: "POST",
    body: {
      classSessionId,
      code,
    },
  });
}

export type AttendanceChangeHistory = {
  id: string;
  previousStatus: AttendanceStatus;
  newStatus: AttendanceStatus;
  previousCheckedAt: string | null;
  newCheckedAt: string | null;
  reason: string;
  changedBy: { id: string; name: string } | null;
  changedAt: string;
};

export type SessionAttendanceRecord = {
  id: string;
  student: { id: string; loginId: string | null; name: string };
  status: AttendanceStatus;
  method: AttendanceMethod | null;
  checkedAt: string | null;
  updatedAt: string;
  histories: AttendanceChangeHistory[];
};

export type UpdateAttendanceInput = {
  status: AttendanceStatus;
  /** 출석·지각·조퇴는 실제 도착 시각이 필수다. */
  checkedAt?: string;
  reason: string;
};

export function getSessionAttendance(
  sessionId: string,
): Promise<SessionAttendanceRecord[]> {
  return apiRequest(`/sessions/${sessionId}/attendance`);
}

export function updateAttendanceRecord(
  sessionId: string,
  attendanceRecordId: string,
  input: UpdateAttendanceInput,
): Promise<Omit<SessionAttendanceRecord, "histories">> {
  return apiRequest(`/sessions/${sessionId}/attendance/${attendanceRecordId}`, {
    method: "PATCH",
    body: input,
  });
}

export type MyAttendanceSummary = {
  present: number;
  late: number;
  absent: number;
  earlyLeave: number;
  excused: number;
  unprocessed: number;
  countedTotal: number;
  /** 계산 대상이 없으면 null */
  attendanceRate: number | null;
};

export function getMyAttendanceSummary(): Promise<MyAttendanceSummary> {
  return apiRequest("/attendance/my-summary");
}
