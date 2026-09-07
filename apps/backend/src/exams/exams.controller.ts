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
import { AddExamTargetDto } from './dto/add-exam-target.dto';
import { CancelExamDto } from './dto/cancel-exam.dto';
import { CreateExamDto } from './dto/create-exam.dto';
import { RescheduleExamDto } from './dto/reschedule-exam.dto';
import { ReviseExamResultDto } from './dto/revise-exam-result.dto';
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
import {
  type AttemptDetailResponse,
  ExamResultsService,
} from './exam-results.service';
import type { ExamScheduleValidationResult } from './exam-schedule-validation.service';
import {
  type ExamTargetListResponse,
  ExamTargetsService,
} from './exam-targets.service';
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
    private readonly targets: ExamTargetsService,
    private readonly results: ExamResultsService,
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

  @Post(':id/reschedule')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleExamDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.reschedule(id, dto, actor, request.ip);
  }

  @Post(':id/duplicate')
  duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamResponse> {
    return this.service.duplicate(id, actor, request.ip);
  }

  @Post(':id/results/review')
  reviewResults(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<{ reviewedAt: string }> {
    return this.results.review(id, actor, request.ip);
  }

  @Post(':id/results/publish')
  publishResults(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<{ publishedAt: string }> {
    return this.results.publish(id, actor, request.ip);
  }

  @Get(':id/attempts/:attemptId')
  attemptDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttemptDetailResponse> {
    return this.results.getAttemptDetail(id, attemptId, actor);
  }

  @Post(':id/attempts/:attemptId/revise')
  reviseResult(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body() dto: ReviseExamResultDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<AttemptDetailResponse> {
    return this.results.revise(id, attemptId, dto, actor, request.ip);
  }

  @Get(':id/targets')
  listTargets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamTargetListResponse> {
    return this.targets.list(id, actor);
  }

  @Post(':id/targets/rebuild')
  rebuildTargets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTargetListResponse> {
    return this.targets.rebuild(id, actor, request.ip);
  }

  @Post(':id/targets/lock')
  lockTargets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTargetListResponse> {
    return this.targets.lock(id, actor, request.ip);
  }

  @Post(':id/targets')
  addTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddExamTargetDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTargetListResponse> {
    return this.targets.addManual(id, dto, actor, request.ip);
  }

  @Delete(':id/targets/:studentId')
  removeTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<ExamTargetListResponse> {
    return this.targets.remove(id, studentId, actor, request.ip);
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
