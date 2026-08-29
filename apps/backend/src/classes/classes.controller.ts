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
  type ClassPageResponse,
  type ClassResponse,
  ClassesService,
} from './classes.service';
import { ChangeClassStatusDto } from './dto/change-class-status.dto';
import { ClassQueryDto } from './dto/class-query.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings/:courseOfferingId/classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  findAll(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Query() query: ClassQueryDto,
  ): Promise<ClassPageResponse> {
    return this.classesService.findAll(courseOfferingId, query);
  }

  @Get(':classId')
  findOne(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<ClassResponse> {
    return this.classesService.findOne(courseOfferingId, classId);
  }

  @Post()
  create(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Body() dto: CreateClassDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.classesService.create(courseOfferingId, dto, actor, request.ip);
  }

  @Patch(':classId')
  update(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.classesService.update(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }

  @Delete(':classId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.classesService.remove(
      courseOfferingId,
      classId,
      actor,
      request.ip,
    );
  }

  @Patch(':classId/status')
  changeStatus(
    @Param('courseOfferingId', ParseUUIDPipe) courseOfferingId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: ChangeClassStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ClassResponse> {
    return this.classesService.changeStatus(
      courseOfferingId,
      classId,
      dto,
      actor,
      request.ip,
    );
  }
}
