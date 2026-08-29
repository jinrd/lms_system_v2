import { Module } from '@nestjs/common';
import { ClassInstructorsController } from './class-instructors.controller';
import { ClassInstructorsService } from './class-instructors.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  controllers: [ClassesController, ClassInstructorsController],
  providers: [ClassesService, ClassInstructorsService],
  exports: [ClassesService, ClassInstructorsService],
})
export class ClassesModule {}
