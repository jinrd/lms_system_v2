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
import { CreateRegularEnrollmentDto } from './dto/create-regular-enrollment.dto';
import { EnrollmentQueryDto } from './dto/enrollment-query.dto';
import {
  type EnrollmentPageResponse,
  type EnrollmentResponse,
  EnrollmentsService,
} from './enrollments.service';
import { CreateSubjectEnrollmentDto } from './dto/create-subject-enrollment.dto';
import { WithdrawEnrollmentDto } from './dto/withdraw-enrollment.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('classes/:classId/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('subject-candidates')
  findSubjectCandidates(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    return this.enrollmentsService.findSubjectCandidates(classId, query);
  }

  @Get()
  findAll(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    return this.enrollmentsService.findAll(classId, query);
  }

  @Post()
  createRegular(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateRegularEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse[]> {
    return this.enrollmentsService.createRegular(
      classId,
      dto,
      actor,
      request.ip,
    );
  }

  @Post('subjects')
  createSubjectEnrollment(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateSubjectEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse> {
    return this.enrollmentsService.createSubjectEnrollment(
      classId,
      dto,
      actor,
      request.ip,
    );
  }

  @Patch(':enrollmentId/withdraw')
  withdraw(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: WithdrawEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse[]> {
    return this.enrollmentsService.withdraw(
      classId,
      enrollmentId,
      dto,
      actor,
      request.ip,
    );
  }
}
