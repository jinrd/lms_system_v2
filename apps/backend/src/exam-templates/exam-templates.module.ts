import { Module } from '@nestjs/common';
import { QuestionsModule } from '../questions/questions.module';
import { ExamTemplateAccessService } from './exam-template-access.service';
import { ExamTemplatesController } from './exam-templates.controller';
import { ExamTemplatesService } from './exam-templates.service';

@Module({
  imports: [QuestionsModule],
  controllers: [ExamTemplatesController],
  providers: [ExamTemplatesService, ExamTemplateAccessService],
  exports: [ExamTemplatesService, ExamTemplateAccessService],
})
export class ExamTemplatesModule {}
