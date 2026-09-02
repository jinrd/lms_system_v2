import { Module } from '@nestjs/common';
import { QuestionAccessService } from './question-access.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionAccessService],
  exports: [QuestionsService, QuestionAccessService],
})
export class QuestionsModule {}
