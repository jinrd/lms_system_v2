import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type {
  AuthenticatedUser,
  AuthResponse,
  CurrentUserResponse,
  PendingConsentResponse,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { ConsentDto } from './dto/consent.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './decorators/public.decorator';
import { AllowPasswordChange } from './decorators/allow-password-change.decorator';
import { AllowPendingConsent } from './decorators/allow-pending-consent.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SignupDto, SignupResponse } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
  ): Promise<AuthResponse | PendingConsentResponse> {
    return this.authService.login(dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  /**
   * 필수 약관 미동의로 제한 인증 상태인 사용자가 약관에 동의하고 정식 세션을
   * 발급받는다(기획안 §7.2 / D-43). 제한 토큰으로만 호출한다.
   */
  @AllowPendingConsent()
  @Post('consent')
  @HttpCode(HttpStatus.OK)
  consent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConsentDto,
    @Req() request: Request,
  ): Promise<AuthResponse> {
    return this.authService.consent(user, dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
  ): Promise<AuthResponse> {
    return this.authService.refresh(dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto);
  }

  @AllowPasswordChange()
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user, dto);
  }

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedUser): CurrentUserResponse {
    return {
      id: user.id,
      loginId: user.loginId,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  @Public()
  @Post('signup')
  signup(
    @Body() dto: SignupDto,
    @Req() request: Request,
  ): Promise<SignupResponse> {
    return this.authService.signup(dto, request.ip);
  }
}
