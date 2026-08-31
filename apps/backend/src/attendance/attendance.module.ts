import { Module } from '@nestjs/common';
import {
  AttendanceCodesController,
  StudentAttendanceController,
} from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  controllers: [AttendanceCodesController, StudentAttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
