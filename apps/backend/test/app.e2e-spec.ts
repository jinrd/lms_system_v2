import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('Backend foundation', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns the service status', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    const responseBody: unknown = response.body;

    expect(response.headers['x-request-id']).toEqual(expect.any(String));

    expect(responseBody).toEqual({
      status: 'ok',
      service: 'lms-backend',
      timestamp: expect.any(String),
    });

    expect(isRecord(responseBody)).toBe(true);

    if (!isRecord(responseBody) || typeof responseBody.timestamp !== 'string') {
      throw new Error('Invalid health response');
    }

    expect(Number.isNaN(Date.parse(responseBody.timestamp))).toBe(false);
  });

  it('returns the standard error response for an unknown route', async () => {
    const response = await request(app.getHttpServer())
      .get('/not-found')
      .expect(404);

    const responseBody: unknown = response.body;

    expect(responseBody).toEqual({
      success: false,
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Cannot GET /not-found',
      request_id: expect.any(String),
    });

    if (
      !isRecord(responseBody) ||
      typeof responseBody.request_id !== 'string'
    ) {
      throw new Error('Invalid error response');
    }

    expect(response.headers['x-request-id']).toBe(responseBody.request_id);
  });
});
