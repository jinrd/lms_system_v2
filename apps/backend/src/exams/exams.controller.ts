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
import { CancelExamDto } from './dto/cancel-exam.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { ReplaceExamPracticalCriteriaDto } from './dto/replace-exam-practical-criteria.dto';
import { ReplaceExamQuestionsDto } from './dto/replace-exam-questions.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { UpsertExamPartDto } from './dto/upsert-exam-part.dto';
import {
  type ExamCriteriaResponse,
  ExamCompositionService,
  type ExamQuestionsResponse,
} from './exam-composition.service';
import type { ExamScheduleValidationResult } from './exam-schedule-validation.service';
import { type ExamResponse, ExamsService } from './exams.service';

@Controller('exams')
@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class ExamsController {
  constructor(
    private readonly service: ExamsService,
    private readonly composition: ExamCompositionService,
  ) {}

  @Get()
  list(
    @Query() query: ExamQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<ExamResponse>> {
    return this.service.list(query, actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamResponse> {
    return this.service.getById(id, actor);
  }

  @Post()
  create(
    @Body() dto: CreateExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.create(dto, actor, request.ip);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.update(id, dto, actor, request.ip);
  }

  @Get(':id/validate')
  validate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamScheduleValidationResult> {
    return this.service.validate(id, actor);
  }

  @Post(':id/schedule')
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.schedule(id, actor, request.ip);
  }

  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.cancel(id, dto, actor, request.ip);
  }

  @Get(':id/parts/WRITTEN/questions')
  getWrittenQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamQuestionsResponse> {
    return this.composition.getWrittenQuestions(id, actor);
  }

  @Put(':id/parts/WRITTEN/questions')
  replaceWrittenQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceExamQuestionsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamQuestionsResponse> {
    return this.composition.replaceWrittenQuestions(id, dto, actor, request.ip);
  }

  @Get(':id/parts/PRACTICAL/criteria')
  getPracticalCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamCriteriaResponse> {
    return this.composition.getPracticalCriteria(id, actor);
  }

  @Put(':id/parts/PRACTICAL/criteria')
  replacePracticalCriteria(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceExamPracticalCriteriaDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamCriteriaResponse> {
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
    @Body() dto: UpsertExamPartDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.upsertPart(id, type, dto, actor, request.ip);
  }

  @Delete(':id/parts/:type')
  deletePart(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type', new ParseEnumPipe(ExamPartType)) type: ExamPartType,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.deletePart(id, type, actor, request.ip);
  }
}
