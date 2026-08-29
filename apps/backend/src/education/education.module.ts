import { Module } from '@nestjs/common';
import { EducationFieldsController } from './education-fields.controller';
import { EducationFieldsService } from './education-fields.service';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [EducationFieldsController, SubjectsController],
  providers: [EducationFieldsService, SubjectsService],
  exports: [EducationFieldsService, SubjectsService],
})
export class EducationModule {}
