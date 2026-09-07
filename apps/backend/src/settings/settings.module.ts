import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * 정책값 조회는 배치·인증·출석 등 여러 모듈이 쓰므로 전역으로 노출한다.
 */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
