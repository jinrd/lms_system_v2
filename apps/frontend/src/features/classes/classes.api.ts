import { apiRequest } from "../../lib/api-client";

export type ClassStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";

export type ClassSubject = {
  id: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  sequence: number;
};

export type CurrentInstructor = {
  id: string;
  name: string;
  loginId: string | null;
};

export type ClassItem = {
  id: string;
  courseOfferingId: string;
  name: string;
  description: string | null;
  room: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: ClassStatus;
  subjects: ClassSubject[];
  currentInstructor: CurrentInstructor | null;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClassPage = {
  items: ClassItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type ClassInput = {
  name: string;
  description?: string;
  room?: string;
  startDate: string;
  endDate: string;
  capacity: number;
};

export function getClasses(
  courseOfferingId: string,
  status?: ClassStatus,
  page = 1,
): Promise<ClassPage> {
  const searchParams = new URLSearchParams({
    page: String(page),
    limit: "20",
  });

  if (status) {
    searchParams.set("status", status);
  }

  return apiRequest<ClassPage>(
    `/course-offerings/${courseOfferingId}/classes?${searchParams.toString()}`,
  );
}

export function createClass(
  courseOfferingId: string,
  input: ClassInput,
): Promise<ClassItem> {
  return apiRequest<ClassItem>(
    `/course-offerings/${courseOfferingId}/classes`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function updateClass(
  courseOfferingId: string,
  classId: string,
  input: ClassInput,
): Promise<ClassItem> {
  return apiRequest<ClassItem>(
    `/course-offerings/${courseOfferingId}/classes/${classId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function changeClassStatus(
  courseOfferingId: string,
  classId: string,
  status: ClassStatus,
): Promise<ClassItem> {
  return apiRequest<ClassItem>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/status`,
    {
      method: "PATCH",
      body: { status },
    },
  );
}

export function removeClass(
  courseOfferingId: string,
  classId: string,
): Promise<void> {
  return apiRequest<void>(
    `/course-offerings/${courseOfferingId}/classes/${classId}`,
    {
      method: "DELETE",
    },
  );
}

export type ClassInstructorAssignment = {
  id: string;
  classId: string;
  instructor: {
    id: string;
    name: string;
    loginId: string | null;
  };
  assignedFrom: string;
  assignedTo: string | null;
  assignedBy: {
    id: string;
    name: string;
  } | null;
  reason: string | null;
  current: boolean;
  createdAt: string;
};

export type AssignClassInstructorInput = {
  instructorId: string;
  assignedFrom: string;
  reason: string;
  handoverTitle?: string;
  handoverContent?: string;
};

export function getClassInstructorHistory(
  courseOfferingId: string,
  classId: string,
): Promise<ClassInstructorAssignment[]> {
  return apiRequest<ClassInstructorAssignment[]>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/instructors`,
  );
}

export function assignClassInstructor(
  courseOfferingId: string,
  classId: string,
  input: AssignClassInstructorInput,
): Promise<ClassInstructorAssignment> {
  return apiRequest<ClassInstructorAssignment>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/instructors`,
    {
      method: "POST",
      body: input,
    },
  );
}

export type ClassSchedulePattern = {
  id: string;
  classId: string;
  classSubjectId: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateClassSchedulePatternInput = {
  classSubjectId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
};

export type UpdateClassSchedulePatternInput =
  Partial<CreateClassSchedulePatternInput> & {
    active?: boolean;
  };

export function getClassSchedulePatterns(
  courseOfferingId: string,
  classId: string,
): Promise<ClassSchedulePattern[]> {
  return apiRequest<ClassSchedulePattern[]>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/schedule-patterns`,
  );
}

export function createClassSchedulePattern(
  courseOfferingId: string,
  classId: string,
  input: CreateClassSchedulePatternInput,
): Promise<ClassSchedulePattern> {
  return apiRequest<ClassSchedulePattern>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/schedule-patterns`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function updateClassSchedulePattern(
  courseOfferingId: string,
  classId: string,
  patternId: string,
  input: UpdateClassSchedulePatternInput,
): Promise<ClassSchedulePattern> {
  return apiRequest<ClassSchedulePattern>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/schedule-patterns/${patternId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export type SessionKind = "REGULAR" | "MAKEUP";

export type SessionStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

export type ClassSession = {
  id: string;
  classId: string;
  classSubjectId: string;
  courseOfferingSubjectId: string;
  schedulePatternId: string | null;
  subjectId: string;
  subjectName: string;
  instructor: {
    id: string;
    name: string;
    loginId: string | null;
  };
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
  canceledBy: {
    id: string;
    name: string;
  } | null;
  cancelReason: string | null;
};

export type ClassSessionRange = {
  startDate: string;
  endDate: string;
};

export type ClassSessionGenerationResult = {
  createdCount: number;
  removedCount: number;
  skippedCount: number;
  sessions: ClassSession[];
};

export function getClassSessions(
  courseOfferingId: string,
  classId: string,
  range: ClassSessionRange,
): Promise<ClassSession[]> {
  const searchParams = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  return apiRequest<ClassSession[]>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions?${searchParams.toString()}`,
  );
}

export function generateClassSessions(
  courseOfferingId: string,
  classId: string,
  range: ClassSessionRange,
): Promise<ClassSessionGenerationResult> {
  return apiRequest<ClassSessionGenerationResult>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/generate`,
    {
      method: "POST",
      body: range,
    },
  );
}

export type ClassSubjectDetail = {
  id: string;
  classId: string;
  courseOfferingId: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  educationFieldId: string;
  educationFieldName: string;
  sequence: number;
  createdAt: string;
};

export function getClassSubjects(
  courseOfferingId: string,
  classId: string,
): Promise<ClassSubjectDetail[]> {
  return apiRequest<ClassSubjectDetail[]>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/subjects`,
  );
}

export function addClassSubject(
  courseOfferingId: string,
  classId: string,
  courseOfferingSubjectId: string,
): Promise<ClassSubjectDetail> {
  return apiRequest<ClassSubjectDetail>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/subjects`,
    {
      method: "POST",
      body: {
        courseOfferingSubjectId,
      },
    },
  );
}

export type InstructorClass = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  status: ClassStatus;
  subjectCount: number;
  assignment: {
    assignedFrom: string;
    assignedTo: string | null;
    current: boolean;
  };
};

export type UpdateClassSessionInput = {
  title?: string;
  lessonContent?: string;
  startsAt?: string;
  endsAt?: string;
  room?: string;
};

export function getInstructorClasses(): Promise<InstructorClass[]> {
  return apiRequest<InstructorClass[]>("/instructor/classes");
}

export function updateClassSession(
  courseOfferingId: string,
  classId: string,
  sessionId: string,
  input: UpdateClassSessionInput,
): Promise<ClassSession> {
  return apiRequest<ClassSession>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function changeClassSessionStatus(
  courseOfferingId: string,
  classId: string,
  sessionId: string,
  status: "IN_PROGRESS" | "COMPLETED",
  completedMinutes?: number,
): Promise<ClassSession> {
  return apiRequest<ClassSession>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}/status`,
    {
      method: "PATCH",
      body: {
        status,
        ...(completedMinutes !== undefined ? { completedMinutes } : {}),
      },
    },
  );
}
export type CreateMakeupSessionInput = {
  startsAt: string;
  endsAt: string;
  title?: string;
  room?: string;
  reason: string;
};

export function cancelClassSession(
  courseOfferingId: string,
  classId: string,
  sessionId: string,
  reason: string,
): Promise<ClassSession> {
  return apiRequest<ClassSession>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}/cancel`,
    {
      method: "POST",
      body: {
        reason,
      },
    },
  );
}

export function createMakeupSession(
  courseOfferingId: string,
  classId: string,
  sessionId: string,
  input: CreateMakeupSessionInput,
): Promise<ClassSession> {
  return apiRequest<ClassSession>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}/makeup`,
    {
      method: "POST",
      body: input,
    },
  );
}
