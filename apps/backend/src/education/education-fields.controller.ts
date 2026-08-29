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
import { ChangeEducationFieldActiveDto } from './dto/change-education-field-active.dto';
import { CreateEducationFieldDto } from './dto/create-education-field.dto';
import { UpdateEducationFieldDto } from './dto/update-education-field.dto';
import {
  type EducationFieldResponse,
  EducationFieldsService,
} from './education-fields.service';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Controller('education-fields')
export class EducationFieldsController {
  constructor(
    private readonly educationFieldsService: EducationFieldsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<EducationFieldResponse[]> {
    return this.educationFieldsService.findAll(actor);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post()
  create(
    @Body() dto: CreateEducationFieldDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EducationFieldResponse> {
    return this.educationFieldsService.create(dto, actor, request.ip);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEducationFieldDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EducationFieldResponse> {
    return this.educationFieldsService.update(id, dto, actor, request.ip);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch(':id/active')
  changeActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeEducationFieldActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<EducationFieldResponse> {
    return this.educationFieldsService.changeActive(id, dto, actor, request.ip);
  }
}
