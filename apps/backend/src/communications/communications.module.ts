import { Module } from '@nestjs/common';
import { CommunicationsAccessService } from './communications-access.service';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';

@Module({
  controllers: [NoticesController],
  providers: [CommunicationsAccessService, NoticesService],
  exports: [CommunicationsAccessService, NoticesService],
})
export class CommunicationsModule {}
