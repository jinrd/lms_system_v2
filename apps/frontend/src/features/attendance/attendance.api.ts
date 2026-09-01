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
