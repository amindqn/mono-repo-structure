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
