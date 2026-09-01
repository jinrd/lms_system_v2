import { Module } from '@nestjs/common';
import { ClassSchedulePatternsController } from './class-schedule-patterns.controller';
import { ClassSchedulePatternsService } from './class-schedule-patterns.service';
import { ClassSessionsController } from './class-sessions.controller';
import { ClassSessionsService } from './class-sessions.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { InstructorClassesController } from './instructor-classes.controller';
import { InstructorClassesService } from './instructor-classes.service';

@Module({
  controllers: [
    ClassesController,
    ClassSchedulePatternsController,
    ClassSessionsController,
    InstructorClassesController,
  ],
  providers: [
    ClassesService,
    ClassSchedulePatternsService,
    ClassSessionsService,
    InstructorClassesService,
  ],
  exports: [ClassesService, ClassSchedulePatternsService, ClassSessionsService],
})
export class ClassesModule {}
