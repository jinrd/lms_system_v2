import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PaginatedResult } from '../common/pagination';
import { UserRole } from '../generated/prisma/enums';
import { MyNoticeQueryDto } from './dto/my-notice-query.dto';
import {
  type MyNoticeDetail,
  type MyNoticeListItem,
  NoticeReaderService,
} from './notice-reader.service';

@Controller('me/notices')
@Roles(
  UserRole.STUDENT,
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class MeNoticesController {
  constructor(private readonly reader: NoticeReaderService) {}

  @Get()
  list(
    @Query() query: MyNoticeQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedResult<MyNoticeListItem>> {
    return this.reader.list(query, actor);
  }

  @Get('unread-count')
  unreadCount(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ count: number }> {
    return this.reader.unreadCount(actor);
  }

  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MyNoticeDetail> {
    return this.reader.getById(id, actor);
  }
}
