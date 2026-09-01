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
import {
  CourseOfferingsService,
  type CourseOfferingResponse,
  type CourseOfferingsPageResponse,
} from './course-offerings.service';
import { ChangeCourseArchiveDto } from './dto/change-course-status.dto';
import { CourseOfferingQueryDto } from './dto/course-offering-query.dto';
import { CreateCourseOfferingDto } from './dto/create-course-offering.dto';
import { UpdateCourseOfferingDto } from './dto/update-course-offering.dto';

const MANAGEMENT_ROLES = [
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

@Roles(...MANAGEMENT_ROLES)
@Controller('course-offerings')
export class CourseOfferingsController {
  constructor(private readonly service: CourseOfferingsService) {}

  @Get()
  findAll(
    @Query() query: CourseOfferingQueryDto,
  ): Promise<CourseOfferingsPageResponse> {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CourseOfferingResponse> {
    return this.service.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateCourseOfferingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CourseOfferingResponse> {
    return this.service.create(dto, actor, request.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseOfferingDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CourseOfferingResponse> {
    return this.service.update(id, dto, actor, request.ip);
  }

  @Patch(':id/archive')
  changeArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeCourseArchiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<CourseOfferingResponse> {
    return this.service.changeArchive(id, dto.archived, actor, request.ip);
  }
}
