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
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './decorators/public.decorator';
import { AllowPasswordChange } from './decorators/allow-password-change.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SignupDto, SignupResponse } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthResponse> {
    return this.authService.login(dto, {
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
