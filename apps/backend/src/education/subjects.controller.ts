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
import { ChangeSubjectActiveDto } from './dto/change-subject-active.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { type SubjectResponse, SubjectsService } from './subjects.service';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Controller('education-fields/:educationFieldId/subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  findByEducationField(
    @Param('educationFieldId', ParseUUIDPipe)
    educationFieldId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SubjectResponse[]> {
    return this.subjectsService.findByEducationField(educationFieldId, actor);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post()
  create(
    @Param('educationFieldId', ParseUUIDPipe)
    educationFieldId: string,
    @Body() dto: CreateSubjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SubjectResponse> {
    return this.subjectsService.create(
      educationFieldId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch(':subjectId')
  update(
    @Param('educationFieldId', ParseUUIDPipe)
    educationFieldId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SubjectResponse> {
    return this.subjectsService.update(
      educationFieldId,
      subjectId,
      dto,
      actor,
      request.ip,
    );
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch(':subjectId/active')
  changeActive(
    @Param('educationFieldId', ParseUUIDPipe)
    educationFieldId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: ChangeSubjectActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<SubjectResponse> {
    return this.subjectsService.changeActive(
      educationFieldId,
      subjectId,
      dto,
      actor,
      request.ip,
    );
  }
}
