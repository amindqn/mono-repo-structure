import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { proxyApi } from '../src/lib/server/api-proxy.js';
const original = process.env.API_ORIGIN;
afterEach(() => {
  mock.restoreAll();
  if (original === undefined) delete process.env.API_ORIGIN;
  else process.env.API_ORIGIN = original;
});
test('uses runtime origin, private no-store, and backend correlation', async () => {
  process.env.API_ORIGIN = 'http://backend.internal:4000';
  mock.method(globalThis, 'fetch', async (input: URL, init: RequestInit) => {
    assert.equal(input.href, 'http://backend.internal:4000/api/v1/tasks');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    return Response.json(
      { message: 'Invalid request' },
      { status: 400, headers: { 'x-request-id': 'trace-7' } },
    );
  });
  const response = await proxyApi(new Request('http://frontend/api/v1/tasks'), ['tasks']);
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('x-request-id'), 'trace-7');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
test('blocks unknown paths, unsafe methods, and CSRF before upstream calls', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const path of [['https:', '', 'example.com'], ['..', 'admin'], ['docs']])
    assert.equal((await proxyApi(new Request('http://frontend/'), path)).status, 404);
  assert.equal(
    (await proxyApi(new Request('http://frontend/api/v1/auth/login'), ['auth', 'login'])).status,
    405,
  );
  assert.equal(
    (
      await proxyApi(new Request('http://frontend/api/v1/auth/login', { method: 'POST' }), [
        'auth',
        'login',
      ])
    ).status,
    403,
  );
  assert.equal(
    (
      await proxyApi(
        new Request('http://frontend/api/v1/auth/login', {
          method: 'POST',
          headers: { origin: 'https://hostile.example', 'x-csrf-protection': '1' },
        }),
        ['auth', 'login'],
      )
    ).status,
    403,
  );
  assert.equal(fetcher.mock.callCount(), 0);
});
test('bounds JSON bodies and returns an actionable upstream failure', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unavailable');
  });
  const oversized = new Request('http://frontend/api/v1/tasks', {
    method: 'POST',
    headers: { 'x-csrf-protection': '1' },
    body: 'x'.repeat(16_385),
  });
  assert.equal((await proxyApi(oversized, ['tasks'])).status, 413);
  assert.equal(fetcher.mock.callCount(), 0);
  const response = await proxyApi(new Request('http://frontend/api/v1/tasks'), ['tasks']);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'API_UNAVAILABLE');
});
test('forwards only session cookies and preserves separate Set-Cookie headers', async () => {
  mock.method(globalThis, 'fetch', async (_url: URL, init: RequestInit) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get('cookie'), 'forma_access=access; forma_refresh=refresh');
    const output = new Headers({ 'content-type': 'application/json' });
    output.append('set-cookie', 'forma_access=next; HttpOnly; Path=/api/v1');
    output.append('set-cookie', 'forma_refresh=new; HttpOnly; Path=/api/v1/auth');
    return new Response('{}', { headers: output });
  });
  const response = await proxyApi(
    new Request('http://frontend/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'x-csrf-protection': '1',
        cookie: 'analytics=private; forma_access=access; forma_refresh=refresh',
      },
    }),
    ['auth', 'refresh'],
  );
  assert.equal(response.headers.getSetCookie().length, 2);
});
test('preserves binary multipart bytes and the selected object storage target', async () => {
  const bytes = Uint8Array.from([0, 255, 128, 13, 10]);
  mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    assert.equal(url.searchParams.get('storage'), 'object');
    assert.deepEqual(new Uint8Array(init.body as ArrayBuffer), bytes);
    assert.equal(
      new Headers(init.headers).get('content-type'),
      'multipart/form-data; boundary=test',
    );
    return Response.json({});
  });
  await proxyApi(
    new Request('http://frontend/api/v1/media/upload?storage=object', {
      method: 'POST',
      headers: { 'x-csrf-protection': '1', 'content-type': 'multipart/form-data; boundary=test' },
      body: bytes,
    }),
    ['media', 'upload'],
  );
});

test('compares browser origin with Host when Next normalizes the internal request URL', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ status: 401 }, { status: 401 }));
  const request = new Request('http://localhost:3000/api/v1/auth/refresh', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-csrf-protection': '1' },
  });
  assert.equal((await proxyApi(request, ['auth', 'refresh'])).status, 401);
});
test('allows only POST for public email actions and keeps token payloads out of upstream URLs', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(new Headers(init.headers).get('x-csrf-protection'), '1');
    assert.equal(
      JSON.parse(init.body ? new TextDecoder().decode(init.body as ArrayBuffer) : '{}').token,
      'test-only-token',
    );
    return new Response(null, { status: 204 });
  });
  for (const action of [
    'verify-email',
    'reset-password',
    'forgot-password',
    'resend-verification',
  ]) {
    const url = `http://frontend/api/v1/auth/${action}?token=discarded`;
    assert.equal((await proxyApi(new Request(url), ['auth', action])).status, 405);
    assert.equal(
      (
        await proxyApi(
          new Request(url, {
            method: 'POST',
            headers: { 'x-csrf-protection': '1', 'content-type': 'application/json' },
            body: JSON.stringify({ token: 'test-only-token' }),
          }),
          ['auth', action],
        )
      ).status,
      204,
    );
  }
  assert.equal(fetcher.mock.callCount(), 4);
});
