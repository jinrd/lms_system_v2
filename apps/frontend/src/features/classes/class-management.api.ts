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
  primaryCourseOfferingId: string;
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
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type ManagedClassInput = {
  name: string;
  room?: string;
  startDate: string;
  endDate: string;
  capacity: number;
  programIds: string[];
};

export function getManagedClasses(archived = false): Promise<ManagedClassPage> {
  return apiRequest(`/classes?page=1&limit=100&archived=${String(archived)}`);
}

export function createManagedClass(input: ManagedClassInput): Promise<ManagedClass> {
  return apiRequest("/classes", { method: "POST", body: input });
}

export function updateManagedClass(
  id: string,
  input: Partial<ManagedClassInput>,
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

export function getProgramSchedules(classId: string): Promise<ProgramSchedule[]> {
  return apiRequest(`/classes/${classId}/schedule-patterns`);
}

export function createProgramSchedule(
  classId: string,
  input: { classSubjectId: string; dayOfWeek: number; startTime: string; endTime: string; room?: string },
): Promise<ProgramSchedule> {
  return apiRequest(`/classes/${classId}/schedule-patterns`, {
    method: "POST",
    body: input,
  });
}

export function updateProgramSchedule(
  classId: string,
  id: string,
  input: Partial<{ classSubjectId: string; dayOfWeek: number; startTime: string; endTime: string; room: string; active: boolean }>,
): Promise<ProgramSchedule> {
  return apiRequest(`/classes/${classId}/schedule-patterns/${id}`, {
    method: "PATCH",
    body: input,
  });
}
