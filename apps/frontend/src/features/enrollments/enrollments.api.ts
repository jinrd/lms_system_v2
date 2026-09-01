import { apiRequest } from "../../lib/api-client";

export type EnrollmentType =
  "REGULAR" | "SUPPLEMENT" | "MAKEUP" | "RETAKE" | "AUDIT";

export type EnrollmentStatus =
  "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED";

export type EnrollmentSubject = {
  id: string;
  courseOfferingSubjectId: string;
  subjectId: string;
  subjectName: string;
  startsOn: string;
  endsOn: string | null;
};

export type Enrollment = {
  id: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingId: string;
  courseOfferingName: string;
  classId: string;
  type: EnrollmentType;
  status: EnrollmentStatus;
  startsOn: string;
  endsOn: string | null;
  reason: string | null;
  attendanceManaged: boolean;
  gradeManaged: boolean;
  subjects: EnrollmentSubject[];
  createdAt: string;
  updatedAt: string;
};

export type EnrollmentPage = {
  items: Enrollment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type EnrollmentQuery = {
  status?: EnrollmentStatus;
  keyword?: string;
  page?: number;
  limit?: number;
};

/** 수강 기간은 반 운영 기간을 따르므로 학생만 지정한다. */
export type CreateRegularEnrollmentInput = {
  studentId: string;
};

export function getClassEnrollments(
  classId: string,
  query: EnrollmentQuery = {},
): Promise<EnrollmentPage> {
  const searchParams = new URLSearchParams({
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 20),
  });

  if (query.status) {
    searchParams.set("status", query.status);
  }

  if (query.keyword) {
    searchParams.set("keyword", query.keyword);
  }

  return apiRequest<EnrollmentPage>(
    `/classes/${classId}/enrollments?${searchParams.toString()}`,
  );
}

export function createRegularEnrollment(
  classId: string,
  input: CreateRegularEnrollmentInput,
): Promise<Enrollment[]> {
  return apiRequest<Enrollment[]>(`/classes/${classId}/enrollments`, {
    method: "POST",
    body: input,
  });
}

export type WithdrawEnrollmentInput = {
  effectiveOn: string;
  reason: string;
};

export function withdrawEnrollment(
  classId: string,
  enrollmentId: string,
  input: WithdrawEnrollmentInput,
): Promise<Enrollment[]> {
  return apiRequest<Enrollment[]>(
    `/classes/${classId}/enrollments/${enrollmentId}/withdraw`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export type SubjectEnrollmentType = "SUPPLEMENT" | "MAKEUP";

export type CreateSubjectEnrollmentInput = {
  sourceEnrollmentId: string;
  courseOfferingSubjectId: string;
  type: SubjectEnrollmentType;
  startsOn: string;
  endsOn: string;
  attendanceManaged?: boolean;
  gradeManaged?: boolean;
  reason: string;
};

export function getSubjectEnrollmentCandidates(
  targetClassId: string,
  keyword?: string,
): Promise<EnrollmentPage> {
  const searchParams = new URLSearchParams({
    page: "1",
    limit: "100",
  });

  if (keyword) {
    searchParams.set("keyword", keyword);
  }

  return apiRequest<EnrollmentPage>(
    `/classes/${targetClassId}/enrollments/subject-candidates?${searchParams.toString()}`,
  );
}

export function createSubjectEnrollment(
  classId: string,
  input: CreateSubjectEnrollmentInput,
): Promise<Enrollment> {
  return apiRequest<Enrollment>(`/classes/${classId}/enrollments/subjects`, {
    method: "POST",
    body: input,
  });
}

export type SessionParticipant = {
  id: string;
  classSessionId: string;
  student: {
    id: string;
    loginId: string | null;
    name: string;
    phone: string | null;
  };
  courseOfferingSubjectId: string;
  sourceEnrollmentId: string;
  sourceEnrollmentSubjectId: string;
  type: SubjectEnrollmentType;
  reason: string;
  assignedBy: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
};

export type AssignSessionParticipantInput = {
  sourceEnrollmentId: string;
  type: SubjectEnrollmentType;
  reason: string;
};

export function getSessionParticipants(
  classId: string,
  sessionId: string,
): Promise<SessionParticipant[]> {
  return apiRequest<SessionParticipant[]>(
    `/classes/${classId}/sessions/${sessionId}/participants`,
  );
}

export function assignSessionParticipant(
  classId: string,
  sessionId: string,
  input: AssignSessionParticipantInput,
): Promise<SessionParticipant> {
  return apiRequest<SessionParticipant>(
    `/classes/${classId}/sessions/${sessionId}/participants`,
    {
      method: "POST",
      body: input,
    },
  );
}
