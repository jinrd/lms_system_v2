import { apiRequest } from "../../lib/api-client";

export type SubjectMode = "THEORY" | "PRACTICE" | "MIXED";

export type EducationField = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Subject = {
  id: string;
  educationFieldId: string;
  name: string;
  description: string | null;
  objective: string | null;
  mode: SubjectMode;
  defaultDurationMinutes: number | null;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EducationFieldInput = {
  name: string;
  description?: string;
  displayOrder: number;
  active?: boolean;
};

export type SubjectInput = {
  name: string;
  description?: string;
  objective?: string;
  mode: SubjectMode;
  defaultDurationMinutes?: number;
  displayOrder: number;
  active?: boolean;
};

export function getEducationFields(): Promise<EducationField[]> {
  return apiRequest<EducationField[]>("/education-fields");
}

export function createEducationField(
  input: EducationFieldInput,
): Promise<EducationField> {
  return apiRequest<EducationField>("/education-fields", {
    method: "POST",
    body: {
      ...input,
      active: input.active ?? true,
    },
  });
}

export function updateEducationField(
  id: string,
  input: EducationFieldInput,
): Promise<EducationField> {
  return apiRequest<EducationField>(`/education-fields/${id}`, {
    method: "PATCH",
    body: {
      name: input.name,
      description: input.description,
      displayOrder: input.displayOrder,
    },
  });
}

export function changeEducationFieldActive(
  id: string,
  active: boolean,
): Promise<EducationField> {
  return apiRequest<EducationField>(`/education-fields/${id}/active`, {
    method: "PATCH",
    body: {
      active,
      reason: active ? "교육 분야 사용 재개" : "교육 분야 사용 중지",
    },
  });
}

export function getSubjects(educationFieldId: string): Promise<Subject[]> {
  return apiRequest<Subject[]>(
    `/education-fields/${educationFieldId}/subjects`,
  );
}

export function createSubject(
  educationFieldId: string,
  input: SubjectInput,
): Promise<Subject> {
  return apiRequest<Subject>(`/education-fields/${educationFieldId}/subjects`, {
    method: "POST",
    body: {
      ...input,
      active: input.active ?? true,
    },
  });
}

export function updateSubject(
  educationFieldId: string,
  subjectId: string,
  input: SubjectInput,
): Promise<Subject> {
  return apiRequest<Subject>(
    `/education-fields/${educationFieldId}/subjects/${subjectId}`,
    {
      method: "PATCH",
      body: {
        name: input.name,
        description: input.description,
        objective: input.objective,
        mode: input.mode,
        defaultDurationMinutes: input.defaultDurationMinutes,
        displayOrder: input.displayOrder,
      },
    },
  );
}

export function changeSubjectActive(
  educationFieldId: string,
  subjectId: string,
  active: boolean,
): Promise<Subject> {
  return apiRequest<Subject>(
    `/education-fields/${educationFieldId}/subjects/${subjectId}/active`,
    {
      method: "PATCH",
      body: {
        active,
        reason: active ? "세부 과목 사용 재개" : "세부 과목 사용 중지",
      },
    },
  );
}
