import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  type CourseOfferingSubjectResponse,
  CourseOfferingSubjectsService,
} from './course-offering-subjects.service';
import { AddCourseOfferingSubjectDto } from './dto/add-course-offering-subject.dto';
import { UpdateCourseOfferingSubjectDto } from './dto/update-course-offering-subject.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/subjects')
export class CourseOfferingSubjectsController {
  constructor(
    private readonly courseOfferingSubjectsService: CourseOfferingSubjectsService,
  ) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
  ): Promise<CourseOfferingSubjectResponse[]> {
    return this.courseOfferingSubjectsService.findAll(courseOfferingId);
  }

  @Post()
  add(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Body() dto: AddCourseOfferingSubjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CourseOfferingSubjectResponse> {
    return this.courseOfferingSubjectsService.add(
      courseOfferingId,
      dto,
      actor,
      request.ip,
    );
  }

  @Patch(':courseOfferingSubjectId')
  update(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('courseOfferingSubjectId', ParseUUIDPipe)
    courseOfferingSubjectId: string,
    @Body() dto: UpdateCourseOfferingSubjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CourseOfferingSubjectResponse> {
    return this.courseOfferingSubjectsService.update(
      courseOfferingId,
      courseOfferingSubjectId,
      dto,
      actor,
      request.ip,
    );
  }

  @Delete(':courseOfferingSubjectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('courseOfferingSubjectId', ParseUUIDPipe)
    courseOfferingSubjectId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.courseOfferingSubjectsService.remove(
      courseOfferingId,
      courseOfferingSubjectId,
      actor,
      request.ip,
    );
  }
}
