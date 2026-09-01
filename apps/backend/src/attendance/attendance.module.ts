import { Module } from '@nestjs/common';
import {
  AttendanceCodesController,
  SessionAttendanceController,
  StudentAttendanceController,
} from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({
  controllers: [
    AttendanceCodesController,
    StudentAttendanceController,
    SessionAttendanceController,
  ],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
