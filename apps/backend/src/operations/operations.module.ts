import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

/**
 * 로그·백업·데이터 생명주기 등 운영 관리 기능을 모은다(기획안 §14·§21).
 */
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class OperationsModule {}
