import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { ClassSessionRangeDto } from './dto/class-session-range.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/classes/:classId/sessions')
export class ClassSessionsController {
  constructor(private readonly classSessionsService: ClassSessionsService) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Query() query: ClassSessionRangeDto,
  ): Promise<ClassSessionResponse[]> {
    return this.classSessionsService.findAll(courseOfferingId, classId, query);
  }

  @Post('generate')
  generate(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Body() dto: ClassSessionRangeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSessionGenerationResponse> {
    return this.classSessionsService.generate(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }
}
