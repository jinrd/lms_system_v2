import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResult } from '../common/pagination';
import { ExamPartType, UserRole } from '../generated/prisma/enums';
import { CreateExamTemplateDto } from './dto/create-exam-template.dto';
import { ExamTemplateQueryDto } from './dto/exam-template-query.dto';
import { ReplaceTemplateCriteriaDto } from './dto/replace-template-criteria.dto';
import { ReplaceTemplateQuestionsDto } from './dto/replace-template-questions.dto';
import { UpdateExamTemplateDto } from './dto/update-exam-template.dto';
import { UpsertExamTemplatePartDto } from './dto/upsert-exam-template-part.dto';
import {
  type TemplateCriteriaResponse,
  ExamTemplateCompositionService,
  type TemplateQuestionsResponse,
} from './exam-template-composition.service';
import type { ExamTemplateValidationResult } from './exam-template-validation.service';
import {
  type ExamTemplateResponse,
  ExamTemplatesService,
} from './exam-templates.service';

@Controller('exam-templates')
@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class ExamTemplatesController {
  constructor(
    private readonly service: ExamTemplatesService,
    private readonly composition: ExamTemplateCompositionService,
  ) {}

  @Get()
  list(
    @Query() query: ExamTemplateQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<ExamTemplateResponse>> {
    return this.service.list(query, actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamTemplateResponse> {
    return this.service.getById(id, actor);
  }

  @Post()
  create(
    @Body() dto: CreateExamTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.create(dto, actor, request.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamTemplateDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.update(id, dto, actor, request.ip);
  }

  @Get(':id/validate')
  validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamTemplateValidationResult> {
    return this.service.validate(id, actor);
  }

  @Post(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.activate(id, actor, request.ip);
  }

  @Post(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.deactivate(id, actor, request.ip);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.duplicate(id, actor, request.ip);
  }

  @Get(':id/parts/WRITTEN/questions')
  getWrittenQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TemplateQuestionsResponse> {
    return this.composition.getWrittenQuestions(id, actor);
  }

  @Put(':id/parts/WRITTEN/questions')
  replaceWrittenQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTemplateQuestionsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TemplateQuestionsResponse> {
    return this.composition.replaceWrittenQuestions(id, dto, actor, request.ip);
  }

  @Get(':id/parts/PRACTICAL/criteria')
  getPracticalCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TemplateCriteriaResponse> {
    return this.composition.getPracticalCriteria(id, actor);
  }

  @Put(':id/parts/PRACTICAL/criteria')
  replacePracticalCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceTemplateCriteriaDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<TemplateCriteriaResponse> {
    return this.composition.replacePracticalCriteria(
      id,
      dto,
      actor,
      request.ip,
    );
  }

  @Put(':id/parts/:type')
  upsertPart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(ExamPartType)) type: ExamPartType,
    @Body() dto: UpsertExamTemplatePartDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.upsertPart(id, type, dto, actor, request.ip);
  }

  @Delete(':id/parts/:type')
  deletePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(ExamPartType)) type: ExamPartType,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTemplateResponse> {
    return this.service.deletePart(id, type, actor, request.ip);
  }
}
