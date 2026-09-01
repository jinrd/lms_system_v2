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
  type AttendanceCodeGenerationResponse,
  type AttendanceCodeMetadataResponse,
  type AttendanceSubmissionResponse,
  type StudentAttendanceSessionResponse,
  AttendanceService,
} from './attendance.service';
import { SubmitAttendanceCodeDto } from './dto/submit-attendance-code.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Roles(UserRole.INSTRUCTOR)
@Controller(
  'course-offerings/:courseOfferingId/classes/:classId/sessions/:sessionId/attendance-code',
)
export class AttendanceCodesController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  findCurrent(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttendanceCodeMetadataResponse | null> {
    return this.attendanceService.findCurrentCode(
      courseOfferingId,
      classId,
      sessionId,
      actor,
    );
  }

  @Post()
  generate(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AttendanceCodeGenerationResponse> {
    return this.attendanceService.generateCode(
      courseOfferingId,
      classId,
      sessionId,
      actor,
      request.ip,
    );
  }
}

@Roles(UserRole.STUDENT)
@Controller('attendance')
export class StudentAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('code')
  submitCode(
    @Body() dto: SubmitAttendanceCodeDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AttendanceSubmissionResponse> {
    return this.attendanceService.submitCode(
      dto,
      actor,
      request.ip,
      request.get('user-agent'),
    );
  }

  @Get('my-sessions')
  findMySessions(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StudentAttendanceSessionResponse[]> {
    return this.attendanceService.findMySessions(actor);
  }
}

@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
@Controller('sessions/:sessionId/attendance')
export class SessionAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  findAll(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attendanceService.findSessionAttendance(sessionId, actor);
  }

  @Patch(':attendanceRecordId')
  update(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('attendanceRecordId', ParseUUIDPipe) attendanceRecordId: string,
    @Body() dto: UpdateAttendanceDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.attendanceService.updateAttendance(
      sessionId,
      attendanceRecordId,
      dto,
      actor,
      request.ip,
    );
  }
}
