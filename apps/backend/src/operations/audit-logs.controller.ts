import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { type AuditLogResponse, AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Controller('admin/audit-logs')
@Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @Get()
  list(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLogResponse>> {
    return this.service.list(query);
  }
}
