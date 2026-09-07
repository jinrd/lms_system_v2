import { Module } from '@nestjs/common';
import { CommunicationsAccessService } from './communications-access.service';
import { MeNoticesController } from './me-notices.controller';
import { NoticeReaderService } from './notice-reader.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [NoticesController, MeNoticesController],
  providers: [CommunicationsAccessService, NoticesService, NoticeReaderService],
  exports: [CommunicationsAccessService, NoticesService, NoticeReaderService],
})
export class CommunicationsModule {}
