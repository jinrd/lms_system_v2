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
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { HandoverQueryDto } from './dto/handover-query.dto';
import { UpdateHandoverDto } from './dto/update-handover.dto';
import { type HandoverResponse, HandoversService } from './handovers.service';

@Controller('handovers')
@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class HandoversController {
  constructor(private readonly service: HandoversService) {}

  @Post()
  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  create(
    @Body() dto: CreateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<HandoverResponse> {
    return this.service.create(dto, actor, request.ip);
  }

  @Get()
  list(
    @Query() query: HandoverQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<HandoverResponse>> {
    return this.service.list(query, actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<HandoverResponse> {
    return this.service.getById(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<HandoverResponse> {
    return this.service.update(id, dto, actor, request.ip);
  }

  @Post(':id/acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<HandoverResponse> {
    return this.service.acknowledge(id, actor, request.ip);
  }
}
