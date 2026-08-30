import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { AssignSessionParticipantDto } from './dto/assign-session-participant.dto';
import {
  type SessionParticipantResponse,
  SessionParticipantsService,
} from './session-participants.service';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller(
  'course-offerings/:courseOfferingId/classes/:classId/sessions/:sessionId/participants',
)
export class SessionParticipantsController {
  constructor(
    private readonly sessionParticipantsService: SessionParticipantsService,
  ) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionParticipantResponse[]> {
    return this.sessionParticipantsService.findAll(
      courseOfferingId,
      classId,
      sessionId,
    );
  }

  @Post()
  assign(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AssignSessionParticipantDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SessionParticipantResponse> {
    return this.sessionParticipantsService.assign(
      courseOfferingId,
      classId,
      sessionId,
      dto,
      actor,
      request.ip,
    );
  }
}
