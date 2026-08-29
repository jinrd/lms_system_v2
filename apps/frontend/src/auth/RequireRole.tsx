import type { ReactNode } from "react";
import { ErrorState } from "../components/ui/PageStates";
import { useAuth } from "./AuthProvider";
import type { UserRole } from "./auth.types";

type RequireRoleProps = {
  roles: readonly UserRole[];
  children: ReactNode;
};

export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <ErrorState message="이 페이지에 접근할 권한이 없습니다." />;
  }

  return children;
}
