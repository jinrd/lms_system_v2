import { Module } from '@nestjs/common';
import { CourseOfferingSubjectsController } from './course-offering-subjects.controller';
import { CourseOfferingSubjectsService } from './course-offering-subjects.service';
import { CourseOfferingsController } from './course-offerings.controller';
import { CourseOfferingsService } from './course-offerings.service';

@Module({
  controllers: [CourseOfferingsController, CourseOfferingSubjectsController],
  providers: [CourseOfferingsService, CourseOfferingSubjectsService],
  exports: [CourseOfferingsService, CourseOfferingSubjectsService],
})
export class CoursesModule {}
