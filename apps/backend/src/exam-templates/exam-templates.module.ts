import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ExamTemplateAccessService } from './exam-template-access.service';
import { ExamTemplateCompositionService } from './exam-template-composition.service';
import { ExamTemplateValidationService } from './exam-template-validation.service';
import { ExamTemplatesController } from './exam-templates.controller';
import { ExamTemplatesService } from './exam-templates.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ExamTemplatesController],
  providers: [
    ExamTemplatesService,
    ExamTemplateAccessService,
    ExamTemplateCompositionService,
    ExamTemplateValidationService,
  ],
  exports: [
    ExamTemplatesService,
    ExamTemplateAccessService,
    ExamTemplateCompositionService,
    ExamTemplateValidationService,
  ],
})
export class ExamTemplatesModule {}
