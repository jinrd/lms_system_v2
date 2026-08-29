import { Module } from '@nestjs/common';
import { ClassInstructorsController } from './class-instructors.controller';
import { ClassInstructorsService } from './class-instructors.service';
import { ClassSchedulePatternsController } from './class-schedule-patterns.controller';
import { ClassSchedulePatternsService } from './class-schedule-patterns.service';
import { ClassSessionsController } from './class-sessions.controller';
import { ClassSessionsService } from './class-sessions.service';
import { ClassSubjectsController } from './class-subjects.controller';
import { ClassSubjectsService } from './class-subjects.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  controllers: [
    ClassesController,
    ClassInstructorsController,
    ClassSchedulePatternsController,
    ClassSessionsController,
    ClassSubjectsController,
  ],
  providers: [
    ClassesService,
    ClassInstructorsService,
    ClassSchedulePatternsService,
    ClassSessionsService,
    ClassSubjectsService,
  ],
  exports: [
    ClassesService,
    ClassInstructorsService,
    ClassSchedulePatternsService,
    ClassSessionsService,
    ClassSubjectsService,
  ],
})
export class ClassesModule {}
