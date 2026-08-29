export type UserRole =
  | "STUDENT"
  | "INSTRUCTOR"
  | "MANAGER"
  | "PRINCIPAL"
  | "ADMIN";

export type AuthUser = {
  id: string;
  loginId: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionExpiresAt: string;
  mustChangePassword: boolean;
  user: Omit<AuthUser, "mustChangePassword">;
};

export type LoginInput = {
  loginId: string;
  password: string;
  deviceIdentifier: string;
  deviceName: string;
};
