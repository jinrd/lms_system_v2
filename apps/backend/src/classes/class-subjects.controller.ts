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
import {
  type ClassSubjectResponse,
  ClassSubjectsService,
} from './class-subjects.service';
import { AddClassSubjectDto } from './dto/add-class-subject.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/classes/:classId/subjects')
export class ClassSubjectsController {
  constructor(private readonly classSubjectsService: ClassSubjectsService) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
  ): Promise<ClassSubjectResponse[]> {
    return this.classSubjectsService.findAll(courseOfferingId, classId);
  }

  @Post()
  add(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Body() dto: AddClassSubjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassSubjectResponse> {
    return this.classSubjectsService.add(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }
}
