import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ExamAccessService } from './exam-access.service';
import { ExamCompositionService } from './exam-composition.service';
import { ExamMaintenanceService } from './exam-maintenance.service';
import { ExamScheduleValidationService } from './exam-schedule-validation.service';
import { ExamTargetsService } from './exam-targets.service';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { StudentExamsController } from './student-exams.controller';
import { StudentExamsService } from './student-exams.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ExamsController, StudentExamsController],
  providers: [
    ExamsService,
    ExamAccessService,
    ExamCompositionService,
    ExamScheduleValidationService,
    ExamTargetsService,
    ExamMaintenanceService,
    StudentExamsService,
  ],
  exports: [
    ExamsService,
    ExamAccessService,
    ExamCompositionService,
    ExamScheduleValidationService,
    ExamTargetsService,
  ],
})
export class ExamsModule {}
