import { Module } from '@nestjs/common';
import { CommunicationsAccessService } from './communications-access.service';
import { HandoversController } from './handovers.controller';
import { HandoversService } from './handovers.service';
import { InquiriesController } from './inquiries.controller';
import { InquiriesService } from './inquiries.service';
import { MeNoticesController } from './me-notices.controller';
import { NoticeReaderService } from './notice-reader.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [
    NoticesController,
    MeNoticesController,
    InquiriesController,
    HandoversController,
  ],
  providers: [
    CommunicationsAccessService,
    NoticesService,
    NoticeReaderService,
    InquiriesService,
    HandoversService,
  ],
  exports: [
    CommunicationsAccessService,
    NoticesService,
    NoticeReaderService,
    InquiriesService,
    HandoversService,
  ],
})
export class CommunicationsModule {}
