import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { taskListSchema, taskSchema } from '@repo/contracts';
import { createApplication } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/environment.js';

describe('initialized Nest HTTP application', () => {
  let app: Awaited<ReturnType<typeof createApplication>>;
  beforeAll(async () => {
    app = await createApplication(parseEnvironment({ NODE_ENV: 'test', DOCS_ENABLED: 'true' }));
  });
  afterAll(async () => {
    await app?.close();
  });

  it('creates, lists, completes and reopens a task using validated contracts', async () => {
    const server = app.getHttpAdapter().getInstance();
    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/tasks',
      payload: { title: '  Ship the feature  ' },
    });
    expect(created.statusCode).toBe(201);
    const task = taskSchema.parse(created.json());
    expect(task.title).toBe('Ship the feature');
    expect(task.status).toBe('open');
    const listed = await server.inject({ method: 'GET', url: '/api/v1/tasks' });
    expect(taskListSchema.parse(listed.json()).items.some((item) => item.id === task.id)).toBe(
      true,
    );
    for (const status of ['done', 'open']) {
      const updated = await server.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task.id}`,
        payload: { status },
      });
      expect(updated.statusCode).toBe(200);
      expect(taskSchema.parse(updated.json()).status).toBe(status);
    }
  });

  it('rejects blank/unknown fields, invalid JSON and invalid identifiers', async () => {
    const server = app.getHttpAdapter().getInstance();
    for (const payload of [{ title: ' ' }, { title: 'Valid', role: 'admin' }]) {
      expect(
        (await server.inject({ method: 'POST', url: '/api/v1/tasks', payload })).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/tasks',
          headers: { 'content-type': 'application/json' },
          payload: '{broken',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: 'PATCH',
          url: '/api/v1/tasks/not-a-uuid',
          payload: { status: 'done' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('returns a stable missing-task error with correlation and security headers', async () => {
    const result = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'PATCH',
        url: '/api/v1/tasks/00000000-0000-4000-8000-000000000001',
        payload: { status: 'done' },
      });
    expect(result.statusCode).toBe(404);
    expect(result.json()).toMatchObject({
      status: 404,
      code: 'TASK_NOT_FOUND',
      message: 'Task was not found',
    });
    expect(result.headers['x-request-id']).toBe(result.json().requestId);
    expect(result.headers['x-content-type-options']).toBe('nosniff');
  });

  it('generates OpenAPI operations and exposes liveness and storage readiness separately', async () => {
    const server = app.getHttpAdapter().getInstance();
    const document = await server.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(document.statusCode).toBe(200);
    expect(document.json().paths['/api/v1/tasks'].post).toBeDefined();
    for (const kind of ['live', 'ready']) {
      const response = await server.inject({ method: 'GET', url: `/api/v1/health/${kind}` });
      expect(response.json()).toEqual({ status: 'ok', persistence: 'memory' });
    }
  });
});

describe('startup policy', () => {
  it('prevents disposable production persistence and missing database configuration', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow();
    expect(() => parseEnvironment({ PERSISTENCE: 'postgres' })).toThrow();
    expect(
      parseEnvironment({
        NODE_ENV: 'production',
        PERSISTENCE: 'postgres',
        DATABASE_URL: 'postgresql://example/app',
      }).docsEnabled,
    ).toBe(false);
    expect(() => parseEnvironment({ PORT: 'not-a-number' })).toThrow();
  });
});
