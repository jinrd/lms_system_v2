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
import { TransferEnrollmentDto } from './dto/transfer-enrollment.dto';
import {
  type EnrollmentPageResponse,
  type EnrollmentResponse,
  type EnrollmentTransferResponse,
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
@Controller('course-offerings/:courseOfferingId/classes/:classId/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('subject-candidates')
  findSubjectCandidates(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() query: EnrollmentQueryDto,
  ): Promise<EnrollmentPageResponse> {
    return this.enrollmentsService.findSubjectCandidates(
      courseOfferingId,
      classId,
      query,
    );
  }

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

  @Post('subjects')
  createSubjectEnrollment(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: CreateSubjectEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse> {
    return this.enrollmentsService.createSubjectEnrollment(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }

  @Patch(':enrollmentId/withdraw')
  withdraw(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: WithdrawEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentResponse> {
    return this.enrollmentsService.withdraw(
      courseOfferingId,
      classId,
      enrollmentId,
      dto,
      actor,
      request.ip,
    );
  }

  @Post(':enrollmentId/transfer')
  transfer(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: TransferEnrollmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EnrollmentTransferResponse> {
    return this.enrollmentsService.transfer(
      courseOfferingId,
      classId,
      enrollmentId,
      dto,
      actor,
      request.ip,
    );
  }
}
