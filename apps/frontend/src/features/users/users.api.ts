import { apiRequest } from "../../lib/api-client";
import type { UserRole } from "../../auth/auth.types";

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

export function getActiveInstructors(): Promise<UsersPage> {
  const searchParams = new URLSearchParams({
    role: "INSTRUCTOR",
    status: "ACTIVE",
    page: "1",
    limit: "100",
  });

  return apiRequest<UsersPage>(`/users?${searchParams.toString()}`);
}
