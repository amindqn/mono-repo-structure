import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { proxyApi } from '../src/lib/server/api-proxy.js';

const originalOrigin = process.env.API_ORIGIN;
afterEach(() => {
  mock.restoreAll();
  if (originalOrigin === undefined) delete process.env.API_ORIGIN;
  else process.env.API_ORIGIN = originalOrigin;
});

test('uses the runtime server origin, disables caching, and preserves backend errors', async () => {
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
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('blocks non-allowlisted paths before contacting any upstream', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async () => Response.json({}));
  for (const path of [
    ['https:', '', 'example.com'],
    ['..', 'admin'],
    ['docs'],
    ['tasks', '..', 'health'],
  ]) {
    assert.equal((await proxyApi(new Request('http://frontend/'), path)).status, 404);
  }
  assert.equal(fetcher.mock.callCount(), 0);
});

test('bounds request bodies before forwarding and handles upstream failure', async () => {
  const fetcher = mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unavailable');
  });
  const oversized = new Request('http://frontend/api/v1/tasks', {
    method: 'POST',
    body: 'x'.repeat(16_385),
  });
  assert.equal((await proxyApi(oversized, ['tasks'])).status, 413);
  assert.equal(fetcher.mock.callCount(), 0);
  const offline = await proxyApi(new Request('http://frontend/api/v1/tasks'), ['tasks']);
  assert.equal(offline.status, 502);
  assert.equal((await offline.json()).code, 'API_UNAVAILABLE');
});
