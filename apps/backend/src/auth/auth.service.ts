import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { isMinorOn } from '../common/age';
import type { AuthenticatedUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { UserRole, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

import {
  AccessTokenPayload,
  AuthResponse,
  PendingConsentResponse,
  RequestMetadata,
} from './auth.types';
import { ConsentDto } from './dto/consent.dto';
import { SignupDto, SignupResponse } from './dto/signup.dto';

type PendingTerm = PendingConsentResponse['pendingTerms'][number];

const ACCESS_TOKEN_SECONDS = 15 * 60;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
    metadata: RequestMetadata,
  ): Promise<AuthResponse | PendingConsentResponse> {
    const now = new Date();

    const user = await this.prisma.user.findFirst({
      where: {
        loginId: dto.loginId,
      },
    });

    if (
      !user ||
      !user.loginId ||
      !user.passwordHash ||
      user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      throw new UnauthorizedException(
        '로그인 시도 제한 상태입니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!passwordMatches) {
      await this.recordLoginFailure(
        user.id,
        user.failedLoginAttempts,
        user.lockedUntil,
        now,
      );

      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (
      user.mustChangePassword &&
      user.temporaryPasswordExpiresAt &&
      user.temporaryPasswordExpiresAt <= now
    ) {
      throw new UnauthorizedException('임시 비밀번호가 만료되었습니다.');
    }

    // 필수 약관에 미동의분이 있으면 정식 세션 대신 제한 인증 상태를 반환한다
    // (기획안 §7.2 / D-43). 비밀번호는 맞았으므로 실패 카운터는 초기화한다.
    const pendingTerms = await this.findPendingRequiredTerms(user.id, now);
    if (pendingTerms.length > 0) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
      });
      const consentToken = await this.issueAccessToken({
        sub: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion,
        mustChangePassword: user.mustChangePassword,
        pendingConsent: true,
      });
      return {
        pendingConsent: true,
        consentToken,
        expiresIn: ACCESS_TOKEN_SECONDS,
        pendingTerms,
      };
    }

    return this.establishSession(
      user,
      dto.deviceIdentifier,
      dto.deviceName,
      metadata,
      now,
    );
  }

  /**
   * 기기 세션을 만들고 정식 토큰을 발급한다. 정상 로그인과 약관 동의 완료 후
   * 두 경로가 공유한다. 동일 기기 재로그인 교체와 역할별 기기 수 한도를 지킨다.
   */
  private async establishSession(
    user: {
      id: string;
      loginId: string | null;
      name: string;
      role: UserRole;
      tokenVersion: number;
      mustChangePassword: boolean;
    },
    deviceIdentifier: string,
    deviceName: string | undefined,
    metadata: RequestMetadata,
    now: Date,
  ): Promise<AuthResponse> {
    if (!user.loginId) {
      throw new UnauthorizedException('로그인할 수 없는 계정입니다.');
    }

    const deviceIdentifierHash = this.hashValue(deviceIdentifier);
    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashValue(refreshToken);
    const sessionExpiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
    const sessionLimit = user.role === UserRole.STUDENT ? 1 : 2;

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM users
        WHERE id = ${user.id}::uuid
        FOR UPDATE
      `;

      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          deviceIdentifierHash,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'SAME_DEVICE_RELOGIN',
        },
      });

      const activeSessions = await tx.authSession.findMany({
        where: {
          userId: user.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        orderBy: {
          lastUsedAt: 'asc',
        },
      });

      const sessionsToRevoke = Math.max(
        0,
        activeSessions.length - sessionLimit + 1,
      );

      for (const activeSession of activeSessions.slice(0, sessionsToRevoke)) {
        await tx.authSession.update({
          where: {
            id: activeSession.id,
          },
          data: {
            revokedAt: now,
            revokeReason: 'DEVICE_LIMIT_REPLACED',
          },
        });
      }

      const createdSession = await tx.authSession.upsert({
        where: {
          userId_deviceIdentifierHash: {
            userId: user.id,
            deviceIdentifierHash,
          },
        },
        create: {
          userId: user.id,
          deviceIdentifierHash,
          deviceName,
          refreshTokenHash,
          tokenVersion: user.tokenVersion,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          lastUsedAt: now,
          expiresAt: sessionExpiresAt,
        },
        update: {
          deviceName,
          refreshTokenHash,
          tokenVersion: user.tokenVersion,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          lastUsedAt: now,
          expiresAt: sessionExpiresAt,
          revokedAt: null,
          revokeReason: null,
          createdAt: now,
        },
      });

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: now,
        },
      });

      return createdSession;
    });

    const accessToken = await this.issueAccessToken({
      sub: user.id,
      sid: session.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      sessionExpiresAt: session.expiresAt.toISOString(),
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        loginId: user.loginId,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refresh(
    dto: RefreshTokenDto,
    metadata: RequestMetadata,
  ): Promise<AuthResponse> {
    const now = new Date();
    const previousTokenHash = this.hashValue(dto.refreshToken);

    const session = await this.prisma.authSession.findFirst({
      where: {
        refreshTokenHash: previousTokenHash,
      },
      include: {
        user: true,
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      session.tokenVersion !== session.user.tokenVersion
    ) {
      throw new UnauthorizedException('유효하지 않은 로그인 세션입니다.');
    }

    const refreshToken = this.createRefreshToken();
    const refreshTokenHash = this.hashValue(refreshToken);

    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: previousTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        refreshTokenHash,
        lastUsedAt: now,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      },
    });

    if (rotated.count !== 1) {
      throw new UnauthorizedException('이미 사용된 Refresh Token입니다.');
    }

    const accessToken = await this.issueAccessToken({
      sub: session.user.id,
      sid: session.id,
      role: session.user.role,
      tokenVersion: session.user.tokenVersion,
      mustChangePassword: session.user.mustChangePassword,
    });

    if (!session.user.loginId) {
      throw new UnauthorizedException('로그인할 수 없는 계정입니다.');
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      sessionExpiresAt: session.expiresAt.toISOString(),
      mustChangePassword: session.user.mustChangePassword,
      user: {
        id: session.user.id,
        loginId: session.user.loginId,
        name: session.user.name,
        role: session.user.role,
      },
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const refreshTokenHash = this.hashValue(dto.refreshToken);

    await this.prisma.authSession.updateMany({
      where: {
        refreshTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: 'LOGOUT',
      },
    });
  }

  async changePassword(
    authenticatedUser: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: authenticatedUser.id,
      },
    });

    if (!user?.passwordHash || !user.loginId) {
      throw new UnauthorizedException('로그인할 수 없는 계정입니다.');
    }

    const currentPasswordMatches = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
      );
    }

    const normalizedNewPassword = dto.newPassword.trim().toLowerCase();
    const normalizedPhone = user.phone?.replace(/[^0-9]/g, '');

    if (
      normalizedNewPassword === user.loginId.toLowerCase() ||
      (normalizedPhone &&
        normalizedNewPassword.replace(/[^0-9]/g, '') === normalizedPhone)
    ) {
      throw new BadRequestException(
        '로그인 아이디 또는 전화번호와 같은 비밀번호는 사용할 수 없습니다.',
      );
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT id
      FROM users
      WHERE id = ${user.id}::uuid
      FOR UPDATE
    `;

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          passwordChangedAt: now,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'PASSWORD_CHANGED',
        },
      });
    });
  }

  async signup(dto: SignupDto, ipAddress?: string): Promise<SignupResponse> {
    const loginId = dto.loginId.trim().toLowerCase();
    const normalizedPhone = dto.phone.replace(/[^0-9]/g, '');

    if (
      dto.password.toLowerCase() === loginId ||
      dto.password.replace(/[^0-9]/g, '') === normalizedPhone
    ) {
      throw new BadRequestException(
        '로그인 아이디 또는 전화번호와 같은 비밀번호는 사용할 수 없습니다.',
      );
    }

    // 미성년 여부는 클라이언트가 준 플래그를 믿지 않고 생년월일로 서버가 판정한다
    // (기획안 §3 / Part II line 1343).
    const isMinor = isMinorOn(new Date(dto.birthDate), new Date());

    if (isMinor && (!dto.guardianName || !dto.guardianPhone)) {
      throw new BadRequestException(
        '미성년자는 보호자 이름과 전화번호가 필요합니다.',
      );
    }

    if (!isMinor && (dto.guardianName || dto.guardianPhone)) {
      throw new BadRequestException(
        '성인 가입자는 보호자 정보를 입력할 수 없습니다.',
      );
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        loginId: {
          equals: loginId,
          mode: 'insensitive',
        },
        status: {
          not: UserStatus.DELETED,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
    }

    const currentRequiredTerms = await this.prisma.termsDocument.findMany({
      where: {
        required: true,
        active: true,
        effectiveAt: {
          lte: new Date(),
        },
      },
      select: {
        id: true,
      },
    });

    if (currentRequiredTerms.length === 0) {
      throw new BadRequestException(
        '현재 가입에 필요한 필수 약관이 등록되지 않았습니다.',
      );
    }

    const requiredIds = new Set(
      currentRequiredTerms.map((document) => document.id),
    );
    const agreedIds = new Set(dto.agreedTermsDocumentIds);

    const agreedToEveryRequiredTerm =
      requiredIds.size === agreedIds.size &&
      [...requiredIds].every((id) => agreedIds.has(id));

    if (!agreedToEveryRequiredTerm) {
      throw new BadRequestException('현재 필수 약관에 모두 동의해야 합니다.');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const agreedAt = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const activeTerms = await tx.termsDocument.count({
          where: {
            id: {
              in: dto.agreedTermsDocumentIds,
            },
            required: true,
            active: true,
            effectiveAt: {
              lte: agreedAt,
            },
          },
        });

        if (activeTerms !== dto.agreedTermsDocumentIds.length) {
          throw new BadRequestException(
            '약관 정보가 변경되었습니다. 다시 확인해 주세요.',
          );
        }

        const user = await tx.user.create({
          data: {
            loginId,
            email: dto.email?.trim().toLowerCase(),
            passwordHash,
            name: dto.name.trim(),
            phone: normalizedPhone,
            birthDate: new Date(dto.birthDate),
            gender: dto.gender,
            role: UserRole.STUDENT,
            status: UserStatus.PENDING_APPROVAL,
            passwordChangedAt: agreedAt,
            studentProfile: {
              create: {
                isMinorAtSignup: isMinor,
                guardianName: isMinor ? dto.guardianName?.trim() : null,
                guardianPhone: isMinor
                  ? dto.guardianPhone?.replace(/[^0-9]/g, '')
                  : null,
              },
            },
            termsConsents: {
              create: dto.agreedTermsDocumentIds.map((termsDocumentId) => ({
                termsDocumentId,
                agreed: true,
                agreedAt,
                ipAddress,
              })),
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        return user;
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('이미 사용 중인 로그인 아이디입니다.');
      }

      throw error;
    }
  }

  /**
   * 지금 시행 중인 필수 약관 중 이 사용자가 아직 동의하지 않은 것을 돌려준다
   * (기획안 §7.2). 시행 시각이 지난 `active` 필수 버전만 대상이다.
   */
  private async findPendingRequiredTerms(
    userId: string,
    now: Date,
  ): Promise<PendingTerm[]> {
    const required = await this.prisma.termsDocument.findMany({
      where: { required: true, active: true, effectiveAt: { lte: now } },
      select: { id: true, type: true, version: true, title: true },
    });
    if (required.length === 0) {
      return [];
    }

    const consents = await this.prisma.termsConsent.findMany({
      where: {
        userId,
        agreed: true,
        termsDocumentId: { in: required.map((term) => term.id) },
      },
      select: { termsDocumentId: true },
    });
    const agreed = new Set(consents.map((row) => row.termsDocumentId));

    return required.filter((term) => !agreed.has(term.id));
  }

  /**
   * 제한 인증 상태에서 필수 약관에 동의하고 정식 로그인 세션을 발급한다
   * (기획안 §7.2 / D-43). 동의 저장과 세션 생성을 한 흐름으로 처리한다.
   */
  async consent(
    actor: AuthenticatedUser,
    dto: ConsentDto,
    metadata: RequestMetadata,
  ): Promise<AuthResponse> {
    if (!actor.pendingConsent) {
      throw new BadRequestException('이미 필수 약관에 동의한 계정입니다.');
    }

    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (
      !user ||
      !user.loginId ||
      user.status !== UserStatus.ACTIVE ||
      user.tokenVersion !== actor.tokenVersion
    ) {
      throw new UnauthorizedException(
        '유효하지 않은 인증입니다. 다시 로그인해 주세요.',
      );
    }

    const pending = await this.findPendingRequiredTerms(user.id, now);
    const agreedIds = new Set(dto.agreedTermsDocumentIds);
    const covers = pending.every((term) => agreedIds.has(term.id));
    if (!covers) {
      throw new BadRequestException('현재 필수 약관에 모두 동의해야 합니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      const active = await tx.termsDocument.findMany({
        where: {
          id: { in: dto.agreedTermsDocumentIds },
          active: true,
          effectiveAt: { lte: now },
        },
        select: { id: true },
      });
      if (active.length !== dto.agreedTermsDocumentIds.length) {
        throw new BadRequestException(
          '약관 정보가 변경되었습니다. 다시 확인해 주세요.',
        );
      }

      for (const termsDocumentId of dto.agreedTermsDocumentIds) {
        await tx.termsConsent.upsert({
          where: {
            userId_termsDocumentId: {
              userId: user.id,
              termsDocumentId,
            },
          },
          create: {
            userId: user.id,
            termsDocumentId,
            agreed: true,
            agreedAt: now,
            ipAddress: metadata.ipAddress,
          },
          update: {
            agreed: true,
            agreedAt: now,
            ipAddress: metadata.ipAddress,
          },
        });
      }
    });

    const stillPending = await this.findPendingRequiredTerms(user.id, now);
    if (stillPending.length > 0) {
      throw new BadRequestException('현재 필수 약관에 모두 동의해야 합니다.');
    }

    return this.establishSession(
      user,
      dto.deviceIdentifier,
      dto.deviceName,
      metadata,
      now,
    );
  }

  private async recordLoginFailure(
    userId: string,
    previousAttempts: number,
    lockedUntil: Date | null,
    now: Date,
  ): Promise<void> {
    const attempts =
      lockedUntil && lockedUntil <= now ? 1 : previousAttempts + 1;

    const shouldLock = attempts >= MAX_LOGIN_FAILURES;

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS)
          : null,
      },
    });
  }

  private async issueAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
      audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
      expiresIn: ACCESS_TOKEN_SECONDS,
    });
  }

  private createRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashValue(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    if (!('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
