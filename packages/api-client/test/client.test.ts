import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/index.js';

describe('HTTP client boundary', () => {
  it('validates responses instead of trusting TypeScript assertions', async () => {
    const client = new ApiClient({
      baseUrl: '/api/v1/',
      fetch: vi.fn().mockResolvedValue(Response.json({ items: [{ id: 'bad' }] })),
    });
    await expect(client.listTasks()).rejects.toThrow();
  });

  it('retains correlation IDs for API errors', async () => {
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetch: vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { status: 503, code: 'UNAVAILABLE', message: 'Try again', requestId: 'trace-42' },
            { status: 503 },
          ),
        ),
    });
    await expect(client.listTasks()).rejects.toMatchObject({ status: 503, requestId: 'trace-42' });
  });

  it('handles a reverse proxy returning HTML without leaking it into the interface', async () => {
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetch: vi.fn().mockResolvedValue(new Response('<html>upstream down</html>', { status: 502 })),
    });
    await expect(client.listTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects invalid outgoing input before contacting the network', () => {
    const fetcher = vi.fn();
    const client = new ApiClient({ baseUrl: '/api/v1', fetch: fetcher });
    expect(() => client.createTask({ title: ' ' })).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('session refresh coordination', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'alice@example.com',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Alice',
    bio: '',
    avatarMediaId: null,
    role: 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  it('coalesces concurrent 401s into one refresh and retries each request once', async () => {
    let refreshed = false;
    let rotations = 0;
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/auth/refresh')) {
        rotations++;
        refreshed = true;
        return Response.json({
          user,
          accessExpiresAt: '2026-01-01T00:15:00.000Z',
          sessionExpiresAt: '2026-01-08T00:00:00.000Z',
        });
      }
      if (String(url).endsWith('/auth/me')) return Response.json({}, { status: 401 });
      return Response.json(refreshed ? { items: [] } : {}, { status: refreshed ? 200 : 401 });
    });
    const client = new ApiClient({ baseUrl: '/api/v1', fetch: fetcher });
    const results = await Promise.all([client.listTasks(), client.listTasks()]);
    expect(rotations).toBe(1);
    expect(results).toEqual([{ items: [] }, { items: [] }]);
  });
  it('does not turn a refresh-server outage into logout', async () => {
    const expired = vi.fn();
    const client = new ApiClient({
      baseUrl: '/api/v1',
      onSessionExpired: expired,
      fetch: vi.fn(async (url: RequestInfo | URL) =>
        Response.json({}, { status: String(url).endsWith('/auth/refresh') ? 503 : 401 }),
      ),
    });
    await expect(client.listTasks()).rejects.toMatchObject({ status: 503 });
    expect(expired).not.toHaveBeenCalled();
  });
  it('rejects late results from an earlier identity', async () => {
    let finish: (response: Response) => void = () => {};
    const client = new ApiClient({
      baseUrl: '/api/v1',
      fetch: vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    });
    const pending = client.listTasks();
    client.sessionChanged();
    finish(Response.json({ items: [] }));
    await expect(pending).rejects.toMatchObject({ status: 409, code: 'SESSION_CHANGED' });
  });
});

it('opens a guest session without unnecessary unauthorized requests or refresh attempts', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ present: false }));
  const client = new ApiClient({ baseUrl: '/api/v1', fetch: fetcher });
  await expect(client.session()).resolves.toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/auth/session');
});

it('validates email action input and never refreshes a public recovery error', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { status: 401, code: 'INVALID_ACTION_TOKEN', message: 'Invalid link', requestId: 'test' },
        { status: 401 },
      ),
    );
  const client = new ApiClient({ baseUrl: '/api/v1', fetch: fetcher });
  expect(() =>
    client.resetPassword({ token: 'bad', newPassword: 'long-enough-password' }),
  ).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(client.verifyEmail('a'.repeat(43), 'original-password')).rejects.toMatchObject({
    status: 401,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('submits normalized email requests and accepts registration without a session', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json(
        { message: 'If this address is eligible, an email will arrive shortly.' },
        { status: 202 },
      ),
    );
  const client = new ApiClient({ baseUrl: '/api/v1', fetch: fetcher });
  await client.forgotPassword({ email: ' USER@Example.test ' });
  expect(fetcher.mock.calls[0]?.[1].body).toBe(JSON.stringify({ email: 'user@example.test' }));
  expect(
    (
      await client.register({
        email: 'user@example.test',
        password: 'long-enough-password',
        displayName: 'User',
      })
    ).message,
  ).toContain('eligible');
});
