import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { SessionParticipantsController } from './session-participants.controller';
import { SessionParticipantsService } from './session-participants.service';

@Module({
  controllers: [EnrollmentsController, SessionParticipantsController],
  providers: [EnrollmentsService, SessionParticipantsService],
  exports: [EnrollmentsService, SessionParticipantsService],
})
export class EnrollmentsModule {}
