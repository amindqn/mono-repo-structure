const allowedPath = /^(tasks(?:\/[0-9a-f-]{36})?|health\/(live|ready))$/i;
const maxBodyBytes = 16_384;

async function readBody(request: Request): Promise<string | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function problem(status: number, code: string, message: string) {
  return Response.json(
    { status, code, message, requestId: crypto.randomUUID() },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** Fixed-origin, allowlisted proxy. Backend location stays server-only and runtime configurable. */
export async function proxyApi(request: Request, path: string[]) {
  const resource = path.join('/');
  if (!allowedPath.test(resource)) return problem(404, 'NOT_FOUND', 'Endpoint not found');
  try {
    const body = await readBody(request);
    const origin = new URL(process.env.API_ORIGIN ?? 'http://127.0.0.1:4000');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
      throw new Error('Invalid API_ORIGIN');
    const url = new URL(`/api/v1/${resource}`, origin);
    const response = await fetch(url, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined
          ? { 'Content-Type': request.headers.get('content-type') ?? 'application/json' }
          : {}),
      },
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    const headers = new Headers({
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    });
    for (const name of ['x-request-id', 'retry-after']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    if (error instanceof RangeError)
      return problem(413, 'REQUEST_TOO_LARGE', 'The request is too large');
    return problem(502, 'API_UNAVAILABLE', 'The API is unavailable. Please try again shortly.');
  }
}
