import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums';

export type AccessTokenPayload = {
  sub: string;
  /** 정식 세션 토큰에만 있다. 약관 동의 전용 제한 토큰에는 없다. */
  sid?: string;
  role: UserRole;
  tokenVersion: number;
  mustChangePassword: boolean;
  /** 필수 약관 미동의 상태의 제한 토큰이면 true. 약관 조회·동의·로그아웃만 허용한다. */
  pendingConsent?: boolean;
};

export type AuthenticatedUser = {
  id: string;
  /** 제한 토큰(약관 동의 전)에는 세션이 없어 빈 문자열이다. */
  sessionId: string;
  loginId: string;
  name: string;
  role: UserRole;
  tokenVersion: number;
  mustChangePassword: boolean;
  /** 필수 약관 미동의 제한 상태면 true. */
  pendingConsent?: boolean;
};

/** 필수 약관 미동의로 정식 로그인 대신 반환하는 제한 인증 상태다(기획안 §7.2 / D-43). */
export type PendingConsentResponse = {
  pendingConsent: true;
  /** 약관 조회·동의·로그아웃에만 쓰는 단기 토큰. */
  consentToken: string;
  expiresIn: number;
  pendingTerms: Array<{
    id: string;
    type: string;
    version: string;
    title: string;
  }>;
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
