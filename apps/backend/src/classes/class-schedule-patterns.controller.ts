import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  ClassSchedulePatternResponse,
  ClassSchedulePatternsService,
} from './class-schedule-patterns.service';
import { CreateClassSchedulePatternDto } from './dto/create-class-schedule-pattern.dto';
import { UpdateClassSchedulePatternDto } from './dto/update-class-schedule-pattern.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller(
  'course-offerings/:courseOfferingId/classes/:classId/schedule-patterns',
)
export class ClassSchedulePatternsController {
  constructor(
    private readonly schedulePatternsService: ClassSchedulePatternsService,
  ) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
  ): Promise<ClassSchedulePatternResponse[]> {
    return this.schedulePatternsService.findAll(courseOfferingId, classId);
  }

  @Post()
  create(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Body() dto: CreateClassSchedulePatternDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSchedulePatternResponse> {
    return this.schedulePatternsService.create(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }

  @Patch(':patternId')
  update(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Param('patternId', ParseUUIDPipe)
    patternId: string,
    @Body() dto: UpdateClassSchedulePatternDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSchedulePatternResponse> {
    return this.schedulePatternsService.update(
      courseOfferingId,
      classId,
      patternId,
      dto,
      actor,
      request.ip,
    );
  }
}
