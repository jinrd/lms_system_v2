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
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { CreateInquiryReplyDto } from './dto/create-inquiry-reply.dto';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { InquiryQueryDto } from './dto/inquiry-query.dto';
import {
  type InquiryDetail,
  type InquiryListItem,
  InquiriesService,
} from './inquiries.service';

@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}

  @Post()
  @Roles(UserRole.STUDENT)
  create(
    @Body() dto: CreateInquiryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<InquiryDetail> {
    return this.service.create(dto, actor, request.ip);
  }

  @Get()
  list(
    @Query() query: InquiryQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<InquiryListItem>> {
    return this.service.list(query, actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<InquiryDetail> {
    return this.service.getById(id, actor);
  }

  @Post(':id/replies')
  addReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateInquiryReplyDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<InquiryDetail> {
    return this.service.addReply(id, dto, actor, request.ip);
  }

  @Post(':id/close')
  @Roles(
    UserRole.INSTRUCTOR,
    UserRole.MANAGER,
    UserRole.PRINCIPAL,
    UserRole.ADMIN,
  )
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<InquiryDetail> {
    return this.service.close(id, actor, request.ip);
  }
}
