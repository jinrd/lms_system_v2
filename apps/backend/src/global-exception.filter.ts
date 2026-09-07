import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from './auth/auth.types';
import { SystemLogsService } from './operations/system-logs.service';
import type { RequestWithId } from './request-id.middleware';

type ExceptionBody = {
  code?: unknown;
  message?: unknown;
};

type ErrorResponse = {
  success: false;
  status: number;
  code: string;
  message: string;
  request_id: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly systemLogs: SystemLogsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId & AuthenticatedRequest>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionBody =
      exception instanceof HttpException
        ? this.toExceptionBody(exception.getResponse())
        : {};

    const requestId = request.requestId ?? 'unknown';
    const code = this.resolveCode(status, exceptionBody);

    // 서버 오류(5xx)와 예상하지 못한 예외만 시스템 로그에 남긴다. 4xx는 정상적인
    // 클라이언트 오류라 남기지 않는다. 요청 본문·헤더·쿼리는 민감값이 섞일 수
    // 있어 기록하지 않고, 경로·메서드·추적 ID·오류 코드만 남긴다(기획안 §14.4).
    if (status >= 500) {
      void this.systemLogs.record({
        level: 'ERROR',
        message:
          exception instanceof Error
            ? `${exception.name}: ${exception.message}`
            : String(exception),
        errorCode: code,
        stack: exception instanceof Error ? (exception.stack ?? null) : null,
        userId: request.user?.id ?? null,
        route: `${request.method} ${request.path}`,
        requestId: request.requestId ?? null,
        metadata: { statusCode: status },
      });
    }

    const body: ErrorResponse = {
      success: false,
      status,
      code,
      message: this.resolveMessage(status, exceptionBody),
      request_id: requestId,
    };

    response.status(status).json(body);
  }

  private toExceptionBody(value: unknown): ExceptionBody {
    if (typeof value === 'string') {
      return { message: value };
    }

    if (typeof value === 'object' && value !== null) {
      return value;
    }

    return {};
  }

  private resolveCode(status: number, body: ExceptionBody): string {
    if (typeof body.code === 'string' && body.code.length > 0) {
      return body.code;
    }

    const codes: Readonly<Record<number, string>> = {
      [HttpStatus.BAD_REQUEST]: 'INVALID_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'AUTHENTICATION_REQUIRED',
      [HttpStatus.FORBIDDEN]: 'ACCESS_DENIED',
      [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
      [HttpStatus.CONFLICT]: 'RESOURCE_CONFLICT',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
    };

    return codes[status] ?? 'REQUEST_FAILED';
  }

  private resolveMessage(status: number, body: ExceptionBody): string {
    if (status === 500) {
      return '서버에서 요청을 처리하지 못했습니다.';
    }

    if (Array.isArray(body.message)) {
      const messages = body.message.filter(
        (message): message is string => typeof message === 'string',
      );

      if (messages.length > 0) {
        return messages.join(', ');
      }
    }

    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }

    return '요청을 처리할 수 없습니다.';
  }
}
