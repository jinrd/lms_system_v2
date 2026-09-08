import { SetMetadata } from '@nestjs/common';

/**
 * 필수 약관 미동의 제한 토큰(`pendingConsent`)으로도 호출할 수 있는 라우트에
 * 붙인다. 약관 조회·동의·로그아웃만 이 표시를 갖는다(기획안 §7.2 / D-43).
 */
export const ALLOW_PENDING_CONSENT_KEY = 'allowPendingConsent';

export const AllowPendingConsent = (): MethodDecorator =>
  SetMetadata(ALLOW_PENDING_CONSENT_KEY, true);
