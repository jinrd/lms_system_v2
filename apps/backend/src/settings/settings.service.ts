import { Injectable } from '@nestjs/common';
import {
  SYSTEM_SETTING_DEFAULTS,
  type SystemSettingKey,
} from '../common/system-settings';
import { PrismaService } from '../prisma/prisma.service';

/** 조회 결과를 이 시간 동안 메모리에 둔다. 배치가 자주 읽어도 DB 부하가 없다. */
const CACHE_TTL_MS = 30_000;

type CacheEntry = { value: unknown; loadedAt: number };

/**
 * `system_settings` 테이블의 정책값을 읽는다. 테이블에 행이 있으면 그 값을,
 * 없으면 `SYSTEM_SETTING_DEFAULTS`의 기본값을 돌려준다.
 *
 * 쓰기(관리자 수정 API)는 아직 만들지 않는다. 값 조정이 필요하면 시드나 직접
 * SQL로 행을 넣고, 이 서비스는 그 행을 30초 캐시로 읽어 반영한다.
 */
@Injectable()
export class SettingsService {
  private readonly cache = new Map<SystemSettingKey, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** 원시값. 타입은 호출부가 안다. */
  async get<T = unknown>(key: SystemSettingKey): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.value as T;
    }

    const row = await this.prisma.systemSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const value = row ? row.value : SYSTEM_SETTING_DEFAULTS[key];
    this.cache.set(key, { value, loadedAt: Date.now() });
    return value as T;
  }

  /** 숫자 정책값. 저장된 값이 숫자가 아니면 기본값으로 되돌린다. */
  async getNumber(key: SystemSettingKey): Promise<number> {
    const value = await this.get(key);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const fallback = SYSTEM_SETTING_DEFAULTS[key];
    return typeof fallback === 'number' ? fallback : 0;
  }

  /** 테스트에서 캐시를 비운다. */
  clearCache(): void {
    this.cache.clear();
  }
}
