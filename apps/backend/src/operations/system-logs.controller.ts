import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { SystemLogQueryDto } from './dto/system-log-query.dto';
import {
  type SystemLogResponse,
  SystemLogsService,
} from './system-logs.service';

@Controller('admin/system-logs')
@Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
export class SystemLogsController {
  constructor(private readonly service: SystemLogsService) {}

  @Get()
  list(
    @Query() query: SystemLogQueryDto,
  ): Promise<PaginatedResult<SystemLogResponse>> {
    return this.service.list(query);
  }
}
