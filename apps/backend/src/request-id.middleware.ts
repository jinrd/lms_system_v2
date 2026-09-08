import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './common/request-context';

export type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    // 이후 핸들러·서비스가 AsyncLocalStorage로 이 ID를 읽을 수 있게 한다.
    runWithRequestContext({ requestId }, () => next());
  }
}
