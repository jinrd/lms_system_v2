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
  ClassSchedulePatternsService,
  type ClassSchedulePatternResponse,
} from './class-schedule-patterns.service';
import { CreateClassSchedulePatternDto } from './dto/create-class-schedule-pattern.dto';
import { UpdateClassSchedulePatternDto } from './dto/update-class-schedule-pattern.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('classes/:classId/schedule-patterns')
export class ClassSchedulePatternsController {
  constructor(private readonly service: ClassSchedulePatternsService) {}

  @Get()
  findAll(
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<ClassSchedulePatternResponse[]> {
    return this.service.findAll(classId);
  }

  @Post()
  create(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateClassSchedulePatternDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSchedulePatternResponse> {
    return this.service.create(classId, dto, actor, request.ip);
  }

  @Patch(':patternId')
  update(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('patternId', ParseUUIDPipe) patternId: string,
    @Body() dto: UpdateClassSchedulePatternDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSchedulePatternResponse> {
    return this.service.update(classId, patternId, dto, actor, request.ip);
  }
}
