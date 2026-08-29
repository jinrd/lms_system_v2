import { Module } from '@nestjs/common';
import { ClassInstructorsController } from './class-instructors.controller';
import { ClassInstructorsService } from './class-instructors.service';
import { ClassSchedulePatternsController } from './class-schedule-patterns.controller';
import { ClassSchedulePatternsService } from './class-schedule-patterns.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  controllers: [
    ClassesController,
    ClassInstructorsController,
    ClassSchedulePatternsController,
  ],
  providers: [
    ClassesService,
    ClassInstructorsService,
    ClassSchedulePatternsService,
  ],
  exports: [
    ClassesService,
    ClassInstructorsService,
    ClassSchedulePatternsService,
  ],
})
export class ClassesModule {}
