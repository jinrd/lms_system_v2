import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';

/**
 * 로그·백업·데이터 생명주기 등 운영 관리 기능을 모은다(기획안 §14·§21).
 */
@Module({
  controllers: [AuditLogsController, SystemLogsController],
  providers: [AuditLogsService, SystemLogsService],
  exports: [AuditLogsService, SystemLogsService],
})
export class OperationsModule {}
