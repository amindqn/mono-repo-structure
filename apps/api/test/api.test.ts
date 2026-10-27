import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { taskSchema } from '@repo/contracts';
import { createApplication } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/environment.js';
import { csrf, multipart, password, png, register } from './helpers.js';
import type { TestApp } from './helpers.js';

describe('authenticated Nest HTTP application', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createApplication(parseEnvironment({ NODE_ENV: 'test', DOCS_ENABLED: 'true' }));
  });
  afterEach(async () => {
    await app?.close();
  });
  const server = () => app.getHttpAdapter().getInstance();
  const cookieOf = (response: { cookies: Array<{ name: string; value: string }> }) =>
    response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  it('creates, lists, completes, and reopens owned tasks', async () => {
    const { cookie, user } = await register(app);
    const response = await server().inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { ...csrf, cookie },
      payload: { title: '  Ship the feature  ' },
    });
    expect(response.statusCode).toBe(201);
    const task = taskSchema.parse(response.json());
    expect(task).toMatchObject({ title: 'Ship the feature', ownerId: user.id, status: 'open' });
    expect(
      (await server().inject({ method: 'GET', url: '/api/v1/tasks', headers: { cookie } })).json()
        .items,
    ).toHaveLength(1);
    for (const status of ['done', 'open'])
      expect(
        (
          await server().inject({
            method: 'PATCH',
            url: `/api/v1/tasks/${task.id}`,
            headers: { ...csrf, cookie },
            payload: { status },
          })
        ).json().status,
      ).toBe(status);
  });
  it('denies guests, missing CSRF headers, hostile origins, and public role assignment', async () => {
    expect((await server().inject({ method: 'GET', url: '/api/v1/tasks' })).statusCode).toBe(401);
    const payload = { email: 'alice@example.com', password, displayName: 'Alice' };
    expect(
      (await server().inject({ method: 'POST', url: '/api/v1/auth/register', payload })).statusCode,
    ).toBe(403);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          headers: { ...csrf, origin: 'https://hostile.example' },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/register',
          headers: csrf,
          payload: { ...payload, role: 'admin' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server().inject({
          method: 'GET',
          url: '/api/v1/tasks',
          headers: { cookie: 'forma_access=invalid' },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('rejects malformed input and retains correlation/security headers', async () => {
    const { cookie } = await register(app);
    for (const payload of [{ title: ' ' }, { title: 'Valid', ownerId: 'forged' }])
      expect(
        (
          await server().inject({
            method: 'POST',
            url: '/api/v1/tasks',
            headers: { ...csrf, cookie },
            payload,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/tasks',
          headers: { ...csrf, cookie, 'content-type': 'application/json' },
          payload: '{broken',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server().inject({
          method: 'PATCH',
          url: '/api/v1/tasks/not-a-uuid',
          headers: { ...csrf, cookie },
          payload: { status: 'done' },
        })
      ).statusCode,
    ).toBe(400);
    const missing = await server().inject({
      method: 'PATCH',
      url: '/api/v1/tasks/00000000-0000-4000-8000-000000000001',
      headers: { ...csrf, cookie },
      payload: { status: 'done' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['x-request-id']).toBe(missing.json().requestId);
    expect(missing.headers['x-content-type-options']).toBe('nosniff');
  });
  it('isolates tasks, files, deletion, and avatars between accounts', async () => {
    const alice = await register(app);
    const bob = await register(app, 'bob@example.com');
    const created = await server().inject({
      method: 'POST',
      url: '/api/v1/tasks',
      headers: { ...csrf, cookie: alice.cookie },
      payload: { title: 'Private task' },
    });
    expect(
      (
        await server().inject({
          method: 'GET',
          url: '/api/v1/tasks',
          headers: { cookie: bob.cookie },
        })
      ).json().items,
    ).toEqual([]);
    expect(
      (
        await server().inject({
          method: 'PATCH',
          url: `/api/v1/tasks/${created.json().id}`,
          headers: { ...csrf, cookie: bob.cookie },
          payload: { status: 'done' },
        })
      ).statusCode,
    ).toBe(404);
    const form = multipart();
    const uploaded = await server().inject({
      method: 'POST',
      url: '/api/v1/media/upload',
      headers: { ...form.headers, ...csrf, cookie: alice.cookie },
      payload: form.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    for (const [method, url] of [
      ['GET', `/api/v1/media/${uploaded.json().id}/content`],
      ['DELETE', `/api/v1/media/${uploaded.json().id}`],
    ] as const)
      expect(
        (await server().inject({ method, url, headers: { ...csrf, cookie: bob.cookie } }))
          .statusCode,
      ).toBe(404);
    expect(
      (
        await server().inject({
          method: 'PATCH',
          url: '/api/v1/users/me',
          headers: { ...csrf, cookie: bob.cookie },
          payload: { displayName: 'Bob', bio: '', avatarMediaId: uploaded.json().id },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('rotates refresh cookies and commits family revocation on replay', async () => {
    const { response } = await register(app);
    const refresh = response.cookies.find((cookie) => cookie.name === 'forma_refresh')!.value;
    const rotated = await server().inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { ...csrf, cookie: `forma_refresh=${refresh}` },
    });
    expect(rotated.statusCode).toBe(200);
    const nextCookie = cookieOf(rotated);
    expect(rotated.cookies.find((cookie) => cookie.name === 'forma_refresh')!.value).not.toBe(
      refresh,
    );
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          headers: { ...csrf, cookie: `forma_refresh=${refresh}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server().inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: nextCookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          headers: { ...csrf, cookie: nextCookie },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('logs out immediately and never returns raw credentials in JSON', async () => {
    const { cookie, response } = await register(app);
    for (const key of ['passwordHash', 'accessToken', 'refreshToken'])
      expect(response.body).not.toContain(key);
    const cookies = response.headers['set-cookie'] as string[];
    expect(
      cookies.every((value) => value.includes('HttpOnly') && value.includes('SameSite=Lax')),
    ).toBe(true);
    expect(cookies.find((value) => value.startsWith('forma_refresh='))).toContain(
      'Path=/api/v1/auth',
    );
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/logout',
          headers: { ...csrf, cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await server().inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } }))
        .statusCode,
    ).toBe(401);
  });
  it('revokes every session on password change and rejects the old password', async () => {
    const { cookie } = await register(app);
    const login = await server().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: csrf,
      payload: { email: 'alice@example.com', password },
    });
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/password',
          headers: { ...csrf, cookie },
          payload: { currentPassword: password, newPassword: 'new-and-long-enough-password' },
        })
      ).statusCode,
    ).toBe(204);
    for (const value of [cookie, cookieOf(login)])
      expect(
        (
          await server().inject({
            method: 'GET',
            url: '/api/v1/auth/me',
            headers: { cookie: value },
          })
        ).statusCode,
      ).toBe(401);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: csrf,
          payload: { email: 'alice@example.com', password },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: csrf,
          payload: { email: 'alice@example.com', password: 'new-and-long-enough-password' },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('lists and revokes an owned session without affecting the current one', async () => {
    const { cookie } = await register(app);
    const login = await server().inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: csrf,
      payload: { email: 'alice@example.com', password },
    });
    const sessions = (
      await server().inject({ method: 'GET', url: '/api/v1/auth/sessions', headers: { cookie } })
    ).json().items as Array<{ id: string; current: boolean }>;
    expect(sessions).toHaveLength(2);
    const other = sessions.find((session) => !session.current)!;
    expect(
      (
        await server().inject({
          method: 'DELETE',
          url: `/api/v1/auth/sessions/${other.id}`,
          headers: { ...csrf, cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await server().inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: cookieOf(login) },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await server().inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
  });
  it('round trips database bytes and unlinks a selected avatar on file deletion', async () => {
    const { cookie } = await register(app);
    const form = multipart();
    const uploaded = await server().inject({
      method: 'POST',
      url: '/api/v1/media/upload?storage=database',
      headers: { ...form.headers, ...csrf, cookie },
      payload: form.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    const id = uploaded.json().id;
    const content = await server().inject({
      method: 'GET',
      url: `/api/v1/media/${id}/content`,
      headers: { cookie },
    });
    expect(content.rawPayload.equals(png)).toBe(true);
    expect(content.headers['content-type']).toContain('image/png');
    const profile = await server().inject({
      method: 'PATCH',
      url: '/api/v1/users/me',
      headers: { ...csrf, cookie },
      payload: { displayName: 'Alice Updated', bio: 'Building things', avatarMediaId: id },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().avatarMediaId).toBe(id);
    expect(
      (
        await server().inject({
          method: 'DELETE',
          url: `/api/v1/media/${id}`,
          headers: { ...csrf, cookie },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await server().inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).json()
        .avatarMediaId,
    ).toBeNull();
  });
  it('rejects disguised, oversized, and unavailable-provider uploads', async () => {
    const { cookie } = await register(app);
    for (const form of [
      multipart(Buffer.from('<svg onload="alert(1)"/>')),
      multipart(png, 'image/jpeg'),
    ])
      expect(
        (
          await server().inject({
            method: 'POST',
            url: '/api/v1/media/upload',
            headers: { ...form.headers, ...csrf, cookie },
            payload: form.payload,
          })
        ).statusCode,
      ).toBe(415);
    const huge = multipart(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/media/upload',
          headers: { ...huge.headers, ...csrf, cookie },
          payload: huge.payload,
        })
      ).statusCode,
    ).toBe(413);
    const form = multipart();
    expect(
      (
        await server().inject({
          method: 'POST',
          url: '/api/v1/media/upload?storage=object',
          headers: { ...form.headers, ...csrf, cookie },
          payload: form.payload,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('documents auth and media while health remains public', async () => {
    const doc = await server().inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(doc.statusCode).toBe(200);
    expect(doc.json().paths['/api/v1/auth/login'].post).toBeDefined();
    expect(doc.json().paths['/api/v1/media/upload'].post).toBeDefined();
    for (const kind of ['live', 'ready'])
      expect(
        (await server().inject({ method: 'GET', url: `/api/v1/health/${kind}` })).json(),
      ).toEqual({ status: 'ok', persistence: 'memory' });
  });
});
it('fails closed on production secrets, persistence, insecure cookies, and ephemeral object metadata', () => {
  expect(() => parseEnvironment({ NODE_ENV: 'production' })).toThrow();
  expect(() =>
    parseEnvironment({
      NODE_ENV: 'production',
      PERSISTENCE: 'postgres',
      DATABASE_URL: 'postgresql://example/app',
    }),
  ).toThrow();
  expect(() =>
    parseEnvironment({
      NODE_ENV: 'production',
      PERSISTENCE: 'postgres',
      DATABASE_URL: 'postgresql://example/app',
      JWT_ACCESS_SECRET: 'x'.repeat(64),
      COOKIE_SECURE: 'false',
    }),
  ).toThrow();
  expect(() => parseEnvironment({ S3_BUCKET: 'private-files' })).toThrow();
});
