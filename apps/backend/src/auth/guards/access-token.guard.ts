import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ALLOW_PASSWORD_CHANGE_KEY } from '../decorators/allow-password-change.decorator';
import { ALLOW_PENDING_CONSENT_KEY } from '../decorators/allow-pending-consent.decorator';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload, AuthenticatedRequest } from '../auth.types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Access Token이 필요합니다.');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: this.configService.getOrThrow<string>('JWT_ISSUER'),
        audience: this.configService.getOrThrow<string>('JWT_AUDIENCE'),
      });
    } catch {
      throw new UnauthorizedException(
        '유효하지 않거나 만료된 Access Token입니다.',
      );
    }

    const now = new Date();

    // 제한 토큰(필수 약관 미동의): 세션이 없다. 약관 조회·동의·로그아웃만 허용한다.
    if (payload.pendingConsent) {
      const allowPendingConsent = this.reflector.getAllAndOverride<boolean>(
        ALLOW_PENDING_CONSENT_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!allowPendingConsent) {
        throw new ForbiddenException(
          '필수 약관에 동의한 후 이용할 수 있습니다.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (
        !user ||
        !user.loginId ||
        user.status !== UserStatus.ACTIVE ||
        payload.tokenVersion !== user.tokenVersion
      ) {
        throw new UnauthorizedException(
          '유효하지 않거나 만료된 인증입니다. 다시 로그인해 주세요.',
        );
      }

      request.user = {
        id: user.id,
        sessionId: '',
        loginId: user.loginId,
        name: user.name,
        role: user.role,
        tokenVersion: user.tokenVersion,
        mustChangePassword: user.mustChangePassword,
        pendingConsent: true,
      };
      return true;
    }

    if (!payload.sid) {
      throw new UnauthorizedException(
        '유효하지 않거나 만료된 Access Token입니다.',
      );
    }

    const session = await this.prisma.authSession.findUnique({
      where: {
        id: payload.sid,
      },
      include: {
        user: true,
      },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw new UnauthorizedException('종료되었거나 만료된 로그인 세션입니다.');
    }

    if (
      session.user.status !== UserStatus.ACTIVE ||
      session.tokenVersion !== session.user.tokenVersion ||
      payload.tokenVersion !== session.user.tokenVersion
    ) {
      throw new UnauthorizedException(
        '사용자 인증 정보가 변경되어 로그인이 종료되었습니다.',
      );
    }

    if (!session.user.loginId) {
      throw new UnauthorizedException('로그인할 수 없는 계정입니다.');
    }

    request.user = {
      id: session.user.id,
      sessionId: session.id,
      loginId: session.user.loginId,
      name: session.user.name,
      role: session.user.role,
      tokenVersion: session.user.tokenVersion,
      mustChangePassword: session.user.mustChangePassword,
    };

    const allowPasswordChange = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (session.user.mustChangePassword && !allowPasswordChange) {
      throw new ForbiddenException('비밀번호를 변경한 후 이용할 수 있습니다.');
    }

    return true;
  }

  private extractBearerToken(
    request: AuthenticatedRequest,
  ): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
