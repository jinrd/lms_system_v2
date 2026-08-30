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
import { CreateRegularEnrollmentDto } from './dto/create-regular-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import {
  type EnrollmentPageResponse,
  type EnrollmentResponse,
  EnrollmentsService,
} from './enrollments.service';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/classes/:classId/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    return this.enrollmentsService.findAll(courseOfferingId, classId, query);
  }

  @Post()
  createRegular(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateRegularEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse> {
    return this.enrollmentsService.createRegular(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }
}
