import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { getRequestId } from '../common/request-context';

/**
 * `audit_logs` 쓰기에 현재 요청의 트레이스 ID를 자동으로 채운다. 호출부가
 * `request_id`를 직접 넣지 않아도 `system_logs`와 `(request_id)` 인덱스로 조인이
 * 된다(기획안 §15.2·§21.1). 이미 값이 들어 있으면 건드리지 않는다.
 */
function fillRequestId<T>(data: T): T {
  const row = data as Record<string, unknown> | null;
  if (row && typeof row === 'object' && row.requestId === undefined) {
    const requestId = getRequestId();
    if (requestId) {
      return { ...row, requestId } as T;
    }
  }
  return data;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
    });

    super({ adapter });

    // 생성자 반환값을 확장 클라이언트로 바꾼다. 서브클래스 메서드(onModuleInit 등)와
    // 트랜잭션 안 tx.auditLog.create 까지 확장이 적용된다.
    return this.$extends({
      name: 'audit-request-id',
      query: {
        auditLog: {
          create({ args, query }) {
            args.data = fillRequestId(args.data);
            return query(args);
          },
          createMany({ args, query }) {
            args.data = Array.isArray(args.data)
              ? args.data.map((row) => fillRequestId(row))
              : fillRequestId(args.data);
            return query(args);
          },
        },
      },
    }) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
