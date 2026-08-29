import type { UserRole } from "../../auth/auth.types";
import { apiRequest } from "../../lib/api-client";

export type UserStatus =
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "REJECTED"
  | "INACTIVE"
  | "DELETE_PENDING"
  | "DELETED";

export type UserSummary = {
  id: string;
  loginId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
};

export type UsersPage = {
  items: UserSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type PendingStudent = {
  id: string;
  loginId: string;
  email: string | null;
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  isMinorAtSignup: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  createdAt: string;
};

export type PendingStudentsPage = {
  items: PendingStudent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type UserStatusChange = {
  id: string;
  previousStatus: UserStatus;
  status: UserStatus;
  changedAt: string;
};

export type UsersQuery = {
  keyword?: string;
  role?: UserRole;
  status?: UserStatus;
  page: number;
  limit?: number;
};

export function getUsers(query: UsersQuery): Promise<UsersPage> {
  const searchParams = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit ?? 20),
  });

  if (query.keyword) {
    searchParams.set("keyword", query.keyword);
  }

  if (query.role) {
    searchParams.set("role", query.role);
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  return apiRequest<UsersPage>(`/users?${searchParams.toString()}`);
}

export function getActiveInstructors(): Promise<UsersPage> {
  return getUsers({
    role: "INSTRUCTOR",
    status: "ACTIVE",
    page: 1,
    limit: 100,
  });
}

export function getPendingStudents(page = 1): Promise<PendingStudentsPage> {
  return apiRequest<PendingStudentsPage>(
    `/users/pending?page=${page}&limit=20`,
  );
}

export function approveStudent(userId: string): Promise<UserStatusChange> {
  return apiRequest<UserStatusChange>(`/users/${userId}/approve`, {
    method: "POST",
  });
}

export function rejectStudent(
  userId: string,
  reason: string,
): Promise<UserStatusChange> {
  return apiRequest<UserStatusChange>(`/users/${userId}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export function deactivateUser(
  userId: string,
  reason: string,
): Promise<UserStatusChange> {
  return apiRequest<UserStatusChange>(`/users/${userId}/deactivate`, {
    method: "PATCH",
    body: { reason },
  });
}

export function reactivateUser(
  userId: string,
  reason: string,
): Promise<UserStatusChange> {
  return apiRequest<UserStatusChange>(`/users/${userId}/reactivate`, {
    method: "PATCH",
    body: { reason },
  });
}

export type StaffRole = "INSTRUCTOR" | "MANAGER" | "PRINCIPAL" | "ADMIN";

export type CreateStaffInput = {
  loginId: string;
  name: string;
  phone: string;
  email?: string;
  role: StaffRole;
};

export type CreateStaffResponse = {
  id: string;
  loginId: string;
  name: string;
  role: StaffRole;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
};

export type TemporaryPasswordResponse = {
  userId: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
};

export function createStaff(
  input: CreateStaffInput,
): Promise<CreateStaffResponse> {
  return apiRequest<CreateStaffResponse>("/users/staff", {
    method: "POST",
    body: input,
  });
}

export function issueTemporaryPassword(
  userId: string,
  reason: string,
): Promise<TemporaryPasswordResponse> {
  return apiRequest<TemporaryPasswordResponse>(
    `/users/${userId}/temporary-password`,
    {
      method: "POST",
      body: { reason },
    },
  );
}
