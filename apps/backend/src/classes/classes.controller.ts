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
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import {
  ClassesService,
  type ClassPageResponse,
  type ClassResponse,
} from './classes.service';
import { ClassQueryDto } from './dto/class-query.dto';
import { ChangeClassSubjectActiveDto } from './dto/change-class-subject-active.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('classes')
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Get()
  findAll(@Query() query: ClassQueryDto): Promise<ClassPageResponse> {
    return this.service.findAll(query);
  }

  @Get(':classId')
  findOne(
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<ClassResponse> {
    return this.service.findOne(classId);
  }

  @Post()
  create(
    @Body() dto: CreateClassDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.service.create(dto, actor, request.ip);
  }

  @Patch(':classId')
  update(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.service.update(classId, dto, actor, request.ip);
  }

  @Patch(':classId/subjects/:classSubjectId')
  changeSubjectActive(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('classSubjectId', ParseUUIDPipe) classSubjectId: string,
    @Body() dto: ChangeClassSubjectActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.service.changeSubjectActive(
      classId,
      classSubjectId,
      dto.active,
      actor,
      request.ip,
    );
  }

  @Delete(':classId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('classId', ParseUUIDPipe) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.service.remove(classId, actor, request.ip);
  }
}
