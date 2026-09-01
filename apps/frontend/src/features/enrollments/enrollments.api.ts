import { apiRequest } from "../../lib/api-client";

export type EnrollmentType =
  | "REGULAR"
  | "SUPPLEMENT"
  | "MAKEUP"
  | "RETAKE"
  | "AUDIT";

export type EnrollmentStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELED";

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

export type CreateRegularEnrollmentInput = {
  studentId: string;
  startsOn: string;
  endsOn?: string;
  reason?: string;
};

export function getClassEnrollments(
  courseOfferingId: string,
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
    `/course-offerings/${courseOfferingId}/classes/${classId}/enrollments?${searchParams.toString()}`,
  );
}

export function createRegularEnrollment(
  courseOfferingId: string,
  classId: string,
  input: CreateRegularEnrollmentInput,
): Promise<Enrollment> {
  return apiRequest<Enrollment>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/enrollments`,
    {
      method: "POST",
      body: input,
    },
  );
}

export type WithdrawEnrollmentInput = {
  effectiveOn: string;
  reason: string;
};

export type TransferEnrollmentInput = {
  targetClassId: string;
  transferOn: string;
  reason: string;
};

export type EnrollmentTransferResult = {
  previousEnrollment: Enrollment;
  newEnrollment: Enrollment;
};

export function withdrawEnrollment(
  courseOfferingId: string,
  classId: string,
  enrollmentId: string,
  input: WithdrawEnrollmentInput,
): Promise<Enrollment> {
  return apiRequest<Enrollment>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/enrollments/${enrollmentId}/withdraw`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function transferEnrollment(
  courseOfferingId: string,
  classId: string,
  enrollmentId: string,
  input: TransferEnrollmentInput,
): Promise<EnrollmentTransferResult> {
  return apiRequest<EnrollmentTransferResult>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/enrollments/${enrollmentId}/transfer`,
    {
      method: "POST",
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
  courseOfferingId: string,
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
    `/course-offerings/${courseOfferingId}/classes/${targetClassId}/enrollments/subject-candidates?${searchParams.toString()}`,
  );
}

export function createSubjectEnrollment(
  courseOfferingId: string,
  classId: string,
  input: CreateSubjectEnrollmentInput,
): Promise<Enrollment> {
  return apiRequest<Enrollment>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/enrollments/subjects`,
    {
      method: "POST",
      body: input,
    },
  );
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
  courseOfferingId: string,
  classId: string,
  sessionId: string,
): Promise<SessionParticipant[]> {
  return apiRequest<SessionParticipant[]>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}/participants`,
  );
}

export function assignSessionParticipant(
  courseOfferingId: string,
  classId: string,
  sessionId: string,
  input: AssignSessionParticipantInput,
): Promise<SessionParticipant> {
  return apiRequest<SessionParticipant>(
    `/course-offerings/${courseOfferingId}/classes/${classId}/sessions/${sessionId}/participants`,
    {
      method: "POST",
      body: input,
    },
  );
}
