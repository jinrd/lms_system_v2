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
import { ChangeQuestionActiveDto } from './dto/change-question-active.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { type QuestionResponse, QuestionsService } from './questions.service';

@Controller('questions')
@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get()
  list(
    @Query() query: QuestionQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<QuestionResponse>> {
    return this.questionsService.list(query, actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<QuestionResponse> {
    return this.questionsService.getById(id, actor);
  }

  @Post()
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuestionResponse> {
    return this.questionsService.create(dto, actor, request.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuestionResponse> {
    return this.questionsService.update(id, dto, actor, request.ip);
  }

  @Patch(':id/active')
  changeActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeQuestionActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<QuestionResponse> {
    return this.questionsService.changeActive(id, dto, actor, request.ip);
  }
}
