import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums';

export type AccessTokenPayload = {
  sub: string;
  sid: string;
  role: UserRole;
  tokenVersion: number;
  mustChangePassword: boolean;
};

export type AuthenticatedUser = {
  id: string;
  sessionId: string;
  loginId: string;
  name: string;
  role: UserRole;
  tokenVersion: number;
  mustChangePassword: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionExpiresAt: string;
  mustChangePassword: boolean;
  user: {
    id: string;
    loginId: string;
    name: string;
    role: UserRole;
  };
};

export type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

export type CurrentUserResponse = {
  id: string;
  loginId: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
};
