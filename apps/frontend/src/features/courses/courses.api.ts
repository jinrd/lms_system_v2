import { apiRequest } from "../../lib/api-client";

export type CourseStatus =
  | "PLANNED"
  | "RECRUITING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

export type CourseOffering = {
  id: string;
  name: string;
  description: string | null;
  curriculum: string | null;
  startDate: string;
  endDate: string;
  capacity: number;
  status: CourseStatus;
  createdById: string | null;
  subjectCount: number;
  classCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CourseOfferingPage = {
  items: CourseOffering[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type CourseOfferingInput = {
  name: string;
  description?: string;
  curriculum?: string;
  startDate: string;
  endDate: string;
  capacity: number;
};

export type CourseOfferingQuery = {
  keyword?: string;
  status?: CourseStatus;
  page: number;
  limit: number;
};

export function getCourseOfferings(
  query: CourseOfferingQuery,
): Promise<CourseOfferingPage> {
  const searchParams = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });

  if (query.keyword) {
    searchParams.set("keyword", query.keyword);
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  return apiRequest<CourseOfferingPage>(
    `/course-offerings?${searchParams.toString()}`,
  );
}

export function getCourseOffering(id: string): Promise<CourseOffering> {
  return apiRequest<CourseOffering>(`/course-offerings/${id}`);
}

export function createCourseOffering(
  input: CourseOfferingInput,
): Promise<CourseOffering> {
  return apiRequest<CourseOffering>("/course-offerings", {
    method: "POST",
    body: input,
  });
}

export function updateCourseOffering(
  id: string,
  input: CourseOfferingInput,
): Promise<CourseOffering> {
  return apiRequest<CourseOffering>(`/course-offerings/${id}`, {
    method: "PATCH",
    body: input,
  });
}

export function changeCourseOfferingStatus(
  id: string,
  status: CourseStatus,
  reason: string,
): Promise<CourseOffering> {
  return apiRequest<CourseOffering>(`/course-offerings/${id}/status`, {
    method: "PATCH",
    body: {
      status,
      reason,
    },
  });
}

export type CourseOfferingSubject = {
  id: string;
  courseOfferingId: string;
  subjectId: string;
  subjectName: string;
  educationFieldId: string;
  educationFieldName: string;
  sequence: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  plannedMinutes: number | null;
  curriculum: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CourseOfferingSubjectInput = {
  subjectId: string;
  sequence: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  plannedMinutes?: number;
  curriculum?: string;
};

export type UpdateCourseOfferingSubjectInput = Omit<
  CourseOfferingSubjectInput,
  "subjectId"
>;

export function getCourseOfferingSubjects(
  courseOfferingId: string,
): Promise<CourseOfferingSubject[]> {
  return apiRequest<CourseOfferingSubject[]>(
    `/course-offerings/${courseOfferingId}/subjects`,
  );
}

export function addCourseOfferingSubject(
  courseOfferingId: string,
  input: CourseOfferingSubjectInput,
): Promise<CourseOfferingSubject> {
  return apiRequest<CourseOfferingSubject>(
    `/course-offerings/${courseOfferingId}/subjects`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function updateCourseOfferingSubject(
  courseOfferingId: string,
  courseOfferingSubjectId: string,
  input: UpdateCourseOfferingSubjectInput,
): Promise<CourseOfferingSubject> {
  return apiRequest<CourseOfferingSubject>(
    `/course-offerings/${courseOfferingId}/subjects/${courseOfferingSubjectId}`,
    {
      method: "PATCH",
      body: input,
    },
  );
}

export function removeCourseOfferingSubject(
  courseOfferingId: string,
  courseOfferingSubjectId: string,
): Promise<void> {
  return apiRequest<void>(
    `/course-offerings/${courseOfferingId}/subjects/${courseOfferingSubjectId}`,
    {
      method: "DELETE",
    },
  );
}
