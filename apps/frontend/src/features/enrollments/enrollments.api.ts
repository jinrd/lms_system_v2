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
