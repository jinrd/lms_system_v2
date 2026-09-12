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

export type PendingTerm = {
  id: string;
  type: string;
  version: string;
  title: string;
};

export type PendingConsentResponse = {
  pendingConsent: true;
  consentToken: string;
  expiresIn: number;
  pendingTerms: PendingTerm[];
};

export type LoginInput = {
  loginId: string;
  password: string;
  deviceIdentifier: string;
  deviceName: string;
};
