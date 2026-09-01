import { apiRequest } from "../../lib/api-client";

export type EducationProgram = {
  id: string;
  name: string;
  archived: boolean;
  primaryEducationField: { id: string; name: string };
  instructor: { id: string; name: string; loginId: string | null };
  subjects: Array<{
    id: string;
    subjectId: string;
    name: string;
    educationFieldId: string;
    educationFieldName: string;
  }>;
  classCount: number;
  createdAt: string;
  updatedAt: string;
};

export type EducationProgramPage = {
  items: EducationProgram[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export function getPrograms(query: {
  keyword?: string;
  archived?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<EducationProgramPage> {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    limit: String(query.limit ?? 100),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.archived) params.set("archived", "true");
  return apiRequest(`/course-offerings?${params.toString()}`);
}

export function createProgram(input: {
  name: string;
  primaryEducationFieldId: string;
  instructorId: string;
  subjectIds: string[];
}): Promise<EducationProgram> {
  return apiRequest("/course-offerings", { method: "POST", body: input });
}

export function updateProgram(
  id: string,
  input: { name?: string; instructorId?: string },
): Promise<EducationProgram> {
  return apiRequest(`/course-offerings/${id}`, { method: "PATCH", body: input });
}

export function changeProgramArchive(
  id: string,
  archived: boolean,
): Promise<EducationProgram> {
  return apiRequest(`/course-offerings/${id}/archive`, {
    method: "PATCH",
    body: { archived },
  });
}
