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
