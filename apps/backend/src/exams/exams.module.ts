import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ExamAccessService } from './exam-access.service';
import { ExamCompositionService } from './exam-composition.service';
import { ExamScheduleValidationService } from './exam-schedule-validation.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ExamsController],
  providers: [
    ExamsService,
    ExamAccessService,
    ExamCompositionService,
    ExamScheduleValidationService,
  ],
  exports: [
    ExamsService,
    ExamAccessService,
    ExamCompositionService,
    ExamScheduleValidationService,
  ],
})
export class ExamsModule {}
