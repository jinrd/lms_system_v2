import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { SaveWrittenAnswerDto } from './dto/save-written-answer.dto';
import {
  type MyExamSummary,
  type MyWrittenQuestionsResponse,
  type SaveWrittenAnswerResponse,
  StudentExamsService,
} from './student-exams.service';

@Roles(UserRole.STUDENT)
@Controller('me/exams')
export class StudentExamsController {
  constructor(private readonly service: StudentExamsService) {}

  @Get()
  listMine(@CurrentUser() actor: AuthenticatedUser): Promise<MyExamSummary[]> {
    return this.service.listMyExams(actor);
  }

  @Get(':examId')
  getMine(
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MyExamSummary> {
    return this.service.getMyExam(actor, examId);
  }

  @Post(':examId/parts/WRITTEN/start')
  startWritten(
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MyWrittenQuestionsResponse> {
    return this.service.startWritten(actor, examId);
  }

  @Get(':examId/parts/WRITTEN/questions')
  getWrittenQuestions(
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MyWrittenQuestionsResponse> {
    return this.service.getWrittenQuestions(actor, examId);
  }

  @Put(':examId/parts/WRITTEN/answers/:questionId')
  saveWrittenAnswer(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: SaveWrittenAnswerDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<SaveWrittenAnswerResponse> {
    return this.service.saveWrittenAnswer(actor, examId, questionId, dto);
  }

  @Post(':examId/parts/WRITTEN/submit')
  submitWritten(
    @Param('examId', ParseUUIDPipe) examId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MyWrittenQuestionsResponse> {
    return this.service.submitWritten(actor, examId);
  }
}
