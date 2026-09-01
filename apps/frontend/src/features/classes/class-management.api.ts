import { apiRequest } from "../../lib/api-client";

export type DerivedClassStatus = "UPCOMING" | "OPERATING" | "ENDED";
export type ManagedClass = {
  id: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  derivedStatus: DerivedClassStatus;
  archived: boolean;
  programs: Array<{
    id: string;
    courseOfferingId: string;
    name: string;
    archived: boolean;
    instructor: { id: string; name: string; loginId: string | null };
    subjects: Array<{
      id: string;
      courseOfferingSubjectId: string;
      subjectId: string;
      name: string;
      active: boolean;
    }>;
  }>;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ManagedClassPage = {
  items: ManagedClass[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ManagedClassInput = {
  name: string;
  room?: string;
  startDate: string;
  endDate: string;
  capacity: number;
  programIds: string[];
};

/** 반 생성 후에는 포함 교육과정을 변경하지 않는다. */
export type ManagedClassUpdateInput = Partial<
  Omit<ManagedClassInput, "programIds">
>;

export function getManagedClasses(archived = false): Promise<ManagedClassPage> {
  return apiRequest(`/classes?page=1&limit=100&archived=${String(archived)}`);
}

export function createManagedClass(
  input: ManagedClassInput,
): Promise<ManagedClass> {
  return apiRequest("/classes", { method: "POST", body: input });
}

export function updateManagedClass(
  id: string,
  input: ManagedClassUpdateInput,
): Promise<ManagedClass> {
  return apiRequest(`/classes/${id}`, { method: "PATCH", body: input });
}

export function removeManagedClass(id: string): Promise<void> {
  return apiRequest(`/classes/${id}`, { method: "DELETE" });
}

export function changeManagedSubject(
  classId: string,
  classSubjectId: string,
  active: boolean,
): Promise<ManagedClass> {
  return apiRequest(`/classes/${classId}/subjects/${classSubjectId}`, {
    method: "PATCH",
    body: { active },
  });
}

export type ProgramSchedule = {
  id: string;
  classId: string;
  classProgramId: string;
  programName: string;
  classSubjectId: string;
  subjectName: string;
  instructor: { id: string; name: string; loginId: string | null };
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  active: boolean;
};

export function getProgramSchedules(
  classId: string,
): Promise<ProgramSchedule[]> {
  return apiRequest(`/classes/${classId}/schedule-patterns`);
}

export function createProgramSchedule(
  classId: string,
  input: {
    classSubjectId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room?: string;
  },
): Promise<ProgramSchedule> {
  return apiRequest(`/classes/${classId}/schedule-patterns`, {
    method: "POST",
    body: input,
  });
}

export function updateProgramSchedule(
  classId: string,
  id: string,
  input: Partial<{
    classSubjectId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    room: string;
    active: boolean;
  }>,
): Promise<ProgramSchedule> {
  return apiRequest(`/classes/${classId}/schedule-patterns/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export type SessionKind = "REGULAR" | "MAKEUP";

export type SessionStatus =
  "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export type ClassSession = {
  id: string;
  classId: string;
  classSubjectId: string;
  courseOfferingSubjectId: string;
  schedulePatternId: string | null;
  subjectId: string;
  subjectName: string;
  instructor: { id: string; name: string; loginId: string | null };
  kind: SessionKind;
  title: string | null;
  lessonContent: string | null;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: SessionStatus;
  completedMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  replacementForSessionId: string | null;
  canceledAt: string | null;
  canceledBy: { id: string; name: string } | null;
  cancelReason: string | null;
};

export type ClassSessionRange = { startDate: string; endDate: string };

export type ClassSessionGenerationResult = {
  createdCount: number;
  removedCount: number;
  skippedCount: number;
  sessions: ClassSession[];
};

export type UpdateClassSessionInput = {
  title?: string;
  lessonContent?: string;
  startsAt?: string;
  endsAt?: string;
  room?: string;
};

export type SessionJournalInput = { title: string; lessonContent: string };

export type CreateMakeupSessionInput = {
  startsAt: string;
  endsAt: string;
  title?: string;
  room?: string;
  reason: string;
};

export function getClassSessions(
  classId: string,
  range: ClassSessionRange,
): Promise<ClassSession[]> {
  const searchParams = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  return apiRequest(`/classes/${classId}/sessions?${searchParams.toString()}`);
}

export function generateClassSessions(
  classId: string,
  range: ClassSessionRange,
): Promise<ClassSessionGenerationResult> {
  return apiRequest(`/classes/${classId}/sessions/generate`, {
    method: "POST",
    body: range,
  });
}

export function updateClassSession(
  classId: string,
  sessionId: string,
  input: UpdateClassSessionInput,
): Promise<ClassSession> {
  return apiRequest(`/classes/${classId}/sessions/${sessionId}`, {
    method: "PATCH",
    body: input,
  });
}

export function changeClassSessionStatus(
  classId: string,
  sessionId: string,
  status: "IN_PROGRESS" | "COMPLETED",
  completedMinutes?: number,
): Promise<ClassSession> {
  return apiRequest(`/classes/${classId}/sessions/${sessionId}/status`, {
    method: "PATCH",
    body: {
      status,
      ...(completedMinutes !== undefined ? { completedMinutes } : {}),
    },
  });
}

export function updateSessionJournal(
  classId: string,
  sessionId: string,
  input: SessionJournalInput,
): Promise<ClassSession> {
  return apiRequest(`/classes/${classId}/sessions/${sessionId}/journal`, {
    method: "PATCH",
    body: input,
  });
}

export function cancelClassSession(
  classId: string,
  sessionId: string,
  reason: string,
): Promise<ClassSession> {
  return apiRequest(`/classes/${classId}/sessions/${sessionId}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export function createMakeupSession(
  classId: string,
  sessionId: string,
  input: CreateMakeupSessionInput,
): Promise<ClassSession> {
  return apiRequest(`/classes/${classId}/sessions/${sessionId}/makeup`, {
    method: "POST",
    body: input,
  });
}

/** 강사가 담당하는 교육과정이 포함된 반 목록 (반 × 교육과정 단위) */
export type InstructorClass = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  subjectCount: number;
};

export function getInstructorClasses(): Promise<InstructorClass[]> {
  return apiRequest("/instructor/classes");
}
