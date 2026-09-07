import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { type BackupRunResponse, BackupsService } from './backups.service';
import { BackupQueryDto } from './dto/backup-query.dto';
import { RecordRestoreTestDto } from './dto/record-restore-test.dto';

@Controller('admin/backups')
@Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
export class BackupsController {
  constructor(private readonly service: BackupsService) {}

  @Get()
  list(
    @Query() query: BackupQueryDto,
  ): Promise<PaginatedResult<BackupRunResponse>> {
    return this.service.list(query);
  }

  @Post(':id/restore-test')
  @Roles(UserRole.ADMIN)
  recordRestoreTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordRestoreTestDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<BackupRunResponse> {
    return this.service.recordRestoreTest(id, dto, actor, request.ip);
  }
}
