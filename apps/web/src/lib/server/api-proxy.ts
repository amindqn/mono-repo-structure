import { AUTH_COOKIES, CSRF_HEADER, MAX_UPLOAD_BYTES } from '@repo/contracts';

const uuid = '[0-9a-f-]{36}';
const routes: ReadonlyArray<[RegExp, readonly string[]]> = [
  [/^tasks$/, ['GET', 'POST']],
  [new RegExp(`^tasks/${uuid}$`, 'i'), ['PATCH']],
  [/^health\/(live|ready)$/, ['GET']],
  [
    /^auth\/(register|login|refresh|logout|password|verify-email|resend-verification|forgot-password|reset-password)$/,
    ['POST'],
  ],
  [/^auth\/(me|sessions|session)$/, ['GET']],
  [new RegExp(`^auth/sessions/${uuid}$`, 'i'), ['DELETE']],
  [/^users\/me$/, ['PATCH']],
  [/^media(?:\/config)?$/, ['GET']],
  [/^media\/upload$/, ['POST']],
  [new RegExp(`^media/${uuid}$`, 'i'), ['DELETE']],
  [new RegExp(`^media/${uuid}/content$`, 'i'), ['GET']],
];
async function readBody(request: Request, limit: number): Promise<ArrayBuffer | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
function problem(status: number, code: string, message: string) {
  return Response.json(
    { status, code, message, requestId: crypto.randomUUID() },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
function sameOrigin(request: Request) {
  if (!request.headers.has('origin')) return true;
  try {
    const url = new URL(request.url);
    const configured = process.env.APP_ORIGIN;
    const expected = configured ?? `${url.protocol}//${request.headers.get('host') ?? url.host}`;
    if (new URL(expected).origin !== expected) return false;
    return request.headers.get('origin') === expected;
  } catch {
    return false;
  }
}
export async function proxyApi(request: Request, path: string[]) {
  const resource = path.join('/');
  const route = routes.find(([pattern]) => pattern.test(resource));
  if (!route) return problem(404, 'NOT_FOUND', 'Endpoint not found');
  if (!route[1].includes(request.method))
    return problem(405, 'METHOD_NOT_ALLOWED', 'Method is not allowed');
  const unsafe = !['GET', 'HEAD'].includes(request.method);
  if (unsafe && request.headers.get(CSRF_HEADER) !== '1')
    return problem(403, 'CSRF_REJECTED', 'CSRF protection header is required');
  if (unsafe && !sameOrigin(request))
    return problem(403, 'ORIGIN_REJECTED', 'Origin is not allowed');
  const upload = resource === 'media/upload';
  try {
    const body = await readBody(request, upload ? MAX_UPLOAD_BYTES + 65_536 : 16_384);
    const origin = new URL(process.env.API_ORIGIN ?? 'http://127.0.0.1:4000');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password)
      throw new Error('Invalid API_ORIGIN');
    const url = new URL(`/api/v1/${resource}`, origin);
    if (upload) {
      const storage = new URL(request.url).searchParams.get('storage');
      if (storage) url.searchParams.set('storage', storage);
    }
    const headers = new Headers({ Accept: request.headers.get('accept') ?? 'application/json' });
    for (const name of ['content-type', 'authorization', 'origin', CSRF_HEADER]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const cookie = request.headers
      .get('cookie')
      ?.split(';')
      .filter((part) =>
        Object.values(AUTH_COOKIES).some((name) => part.trim().startsWith(`${name}=`)),
      )
      .join(';');
    if (cookie) headers.set('cookie', cookie);
    const response = await fetch(url, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(upload ? 30_000 : 10_000)]),
    });
    const output = new Headers({
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'private, no-store',
    });
    for (const name of [
      'x-request-id',
      'retry-after',
      'content-disposition',
      'content-security-policy',
    ]) {
      const value = response.headers.get(name);
      if (value) output.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie())
      if (Object.values(AUTH_COOKIES).some((name) => cookie.startsWith(`${name}=`)))
        output.append('set-cookie', cookie);
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: output,
    });
  } catch (error) {
    if (error instanceof RangeError)
      return problem(413, 'REQUEST_TOO_LARGE', 'The request is too large');
    return problem(502, 'API_UNAVAILABLE', 'The API is unavailable. Please try again shortly.');
  }
}
