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
import {
  type ClassSessionGenerationResponse,
  type ClassSessionResponse,
  ClassSessionsService,
} from './class-sessions.service';
import { ChangeClassSessionStatusDto } from './dto/change-class-session-status.dto';
import { ClassSessionRangeDto } from './dto/class-session-range.dto';
import { UpdateClassSessionDto } from './dto/update-class-session.dto';
import { CreateMakeupSessionDto } from './dto/create-makeup-session.dto';
import { CancelClassSessionDto } from './dto/cancel-class-session.dto';
import { UpdateSessionJournalDto } from './dto/update-session-journal.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

const SESSION_MANAGEMENT_ROLES = [
  UserRole.INSTRUCTOR,
  ...MANAGEMENT_ROLES,
] as const;

const CANCELLATION_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('classes/:classId/sessions')
export class ClassSessionsController {
  constructor(private readonly classSessionsService: ClassSessionsService) {}

  @Roles(...SESSION_MANAGEMENT_ROLES)
  @Get()
  findAll(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Query() query: ClassSessionRangeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ClassSessionResponse[]> {
    return this.classSessionsService.findAll(classId, query, actor);
  }

  @Post('generate')
  generate(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Body() dto: ClassSessionRangeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionGenerationResponse> {
    return this.classSessionsService.generate(classId, dto, actor, request.ip);
  }

  @Roles(...SESSION_MANAGEMENT_ROLES)
  @Patch(':sessionId')
  update(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Param('sessionId', ParseUUIDPipe)
    sessionId: string,
    @Body() dto: UpdateClassSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionResponse> {
    return this.classSessionsService.update(
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...SESSION_MANAGEMENT_ROLES)
  @Patch(':sessionId/status')
  changeStatus(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Param('sessionId', ParseUUIDPipe)
    sessionId: string,
    @Body() dto: ChangeClassSessionStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionResponse> {
    return this.classSessionsService.changeStatus(
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...SESSION_MANAGEMENT_ROLES)
  @Patch(':sessionId/journal')
  updateJournal(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateSessionJournalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionResponse> {
    return this.classSessionsService.updateJournal(
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...CANCELLATION_ROLES)
  @Post(':sessionId/cancel')
  cancel(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Param('sessionId', ParseUUIDPipe)
    sessionId: string,
    @Body() dto: CancelClassSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionResponse> {
    return this.classSessionsService.cancel(
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...CANCELLATION_ROLES)
  @Post(':sessionId/makeup')
  createMakeup(
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Param('sessionId', ParseUUIDPipe)
    sessionId: string,
    @Body() dto: CreateMakeupSessionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionResponse> {
    return this.classSessionsService.createMakeup(
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }
}
