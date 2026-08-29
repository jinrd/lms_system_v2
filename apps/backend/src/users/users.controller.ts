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
  type PendingStudentsPageResponse,
  type UserStatusChangeResponse,
  UsersPageResponse,
  UsersService,
} from './users.service';
import { CreateStaffDto, CreateStaffResponse } from './dto/create-staff.dto';
import {
  IssueTemporaryPasswordDto,
  IssueTemporaryPasswordResponse,
} from './dto/issue-temporary-password.dto';
import { ChangeUserStatusDto } from './dto/change-user-status.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';

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
  findPendingStudents(
    @Query() query: PendingUsersQueryDto,
  ): Promise<PendingStudentsPageResponse> {
    return this.usersService.findPendingStudents(query);
  }

  @Roles(...APPROVAL_ROLES)
  @Post(':id/approve')
  approveStudent(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserStatusChangeResponse> {
    return this.usersService.approveStudent(userId, actor, request.ip);
  }

  @Roles(...APPROVAL_ROLES)
  @Post(':id/reject')
  rejectStudent(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: RejectUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserStatusChangeResponse> {
    return this.usersService.rejectStudent(
      userId,
      dto.reason,
      actor,
      request.ip,
    );
  }

  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  @Post('staff')
  createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CreateStaffResponse> {
    return this.usersService.createStaff(dto, actor, request.ip);
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
