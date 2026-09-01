import { Global, Module } from '@nestjs/common';
import { SessionMaintenanceService } from './session-maintenance.service';

@Global()
@Module({
  providers: [SessionMaintenanceService],
  exports: [SessionMaintenanceService],
})
export class MaintenanceModule {}
