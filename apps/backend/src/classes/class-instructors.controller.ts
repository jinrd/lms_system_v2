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
  type ClassInstructorAssignmentResponse,
  ClassInstructorsService,
} from './class-instructors.service';
import { AssignClassInstructorDto } from './dto/assign-class-instructor.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/classes/:classId/instructors')
export class ClassInstructorsController {
  constructor(
    private readonly classInstructorsService: ClassInstructorsService,
  ) {}

  @Get()
  findHistory(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
  ): Promise<ClassInstructorAssignmentResponse[]> {
    return this.classInstructorsService.findHistory(courseOfferingId, classId);
  }

  @Post()
  assign(
    @Param('courseOfferingId', ParseUUIDPipe)
    courseOfferingId: string,
    @Param('classId', ParseUUIDPipe)
    classId: string,
    @Body() dto: AssignClassInstructorDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassInstructorAssignmentResponse> {
    return this.classInstructorsService.assign(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }
}
