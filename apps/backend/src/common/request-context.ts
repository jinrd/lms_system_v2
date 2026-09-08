import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 요청 단위 컨텍스트다. `RequestIdMiddleware`가 요청마다 `requestId`를 담아
 * 이 저장소 안에서 핸들러 체인을 실행한다. 감사 로그 등 요청 흐름 깊숙한 곳에서
 * 매개변수로 트레이스 ID를 계속 넘기지 않아도 되도록 한다(기획안 §15.2·§21.1).
 */
type RequestContext = {
  requestId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** 현재 요청의 트레이스 ID. 요청 외(배치·CLI)에서는 undefined다. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
