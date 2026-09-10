import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { PendingUsersQueryDto } from './dto/pending-users-query.dto';
import { RejectUserDto } from './dto/reject-user.dto';
import {
  type PendingSignupsPageResponse,
  type SignupApprovalResponse,
  type UserStatusChangeResponse,
  UsersPageResponse,
  UsersService,
} from './users.service';
import { ApproveSignupDto } from './dto/approve-signup.dto';
import {
  IssueTemporaryPasswordDto,
  IssueTemporaryPasswordResponse,
} from './dto/issue-temporary-password.dto';
import { ChangeUserStatusDto } from './dto/change-user-status.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import type { StudentProfileResponse } from './users.service';

const APPROVAL_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(...APPROVAL_ROLES)
  @Get('pending')
  findPendingSignups(
    @Query() query: PendingUsersQueryDto,
  ): Promise<PendingSignupsPageResponse> {
    return this.usersService.findPendingSignups(query);
  }

  @Roles(...APPROVAL_ROLES)
  @Post(':id/approve')
  approveSignup(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ApproveSignupDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SignupApprovalResponse> {
    return this.usersService.approveSignup(userId, dto, actor, request.ip);
  }

  @Roles(...APPROVAL_ROLES)
  @Post(':id/reject')
  rejectSignup(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: RejectUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserStatusChangeResponse> {
    return this.usersService.rejectSignup(
      userId,
      dto.reason,
      actor,
      request.ip,
    );
  }

  @Roles(
    UserRole.INSTRUCTOR,
    UserRole.MANAGER,
    UserRole.PRINCIPAL,
    UserRole.ADMIN,
  )
  @Post(':id/temporary-password')
  issueTemporaryPassword(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: IssueTemporaryPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<IssueTemporaryPasswordResponse> {
    return this.usersService.issueTemporaryPassword(
      userId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  @Get()
  findUsers(@Query() query: UserSearchQueryDto): Promise<UsersPageResponse> {
    return this.usersService.findUsers(query);
  }

  /** 학생 개인정보 수정. 강사는 담당 학생만(기획안 §3 / §6.2). */
  @Roles(
    UserRole.INSTRUCTOR,
    UserRole.MANAGER,
    UserRole.PRINCIPAL,
    UserRole.ADMIN,
  )
  @Patch(':id/profile')
  updateStudentProfile(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateStudentProfileDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<StudentProfileResponse> {
    return this.usersService.updateStudentProfile(
      userId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  @Patch(':id/deactivate')
  deactivateUser(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserStatusChangeResponse> {
    return this.usersService.deactivateUser(
      userId,
      dto.reason,
      actor,
      request.ip,
    );
  }

  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  @Patch(':id/reactivate')
  reactivateUser(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: ChangeUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserStatusChangeResponse> {
    return this.usersService.reactivateUser(
      userId,
      dto.reason,
      actor,
      request.ip,
    );
  }
}
