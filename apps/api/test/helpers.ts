import { EmailProcessor } from '../dist/modules/identity/application/email-processor.js';
import { EMAIL_DELIVERY } from '../dist/modules/identity/domain/email.ports.js';
import type { MemoryEmailDelivery } from '../dist/modules/identity/infrastructure/email-delivery.js';
import type { createApplication } from '../dist/app.js';
export type TestApp = Awaited<ReturnType<typeof createApplication>>;
export const csrf = { 'x-csrf-protection': '1' };
export const password = 'test-password-at-least-twelve';
export const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF1kAAAAASUVORK5CYII=',
  'base64',
);
let fixtureAddress = 1;
export async function register(app: TestApp, email = 'alice@example.com') {
  const remoteAddress = `127.0.1.${(fixtureAddress++ % 254) + 1}`;
  const response = await app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      remoteAddress,
      url: '/api/v1/auth/register',
      headers: csrf,
      payload: { email, password, displayName: email.split('@')[0] },
    });
  if (response.statusCode !== 202) throw new Error(response.body);
  await app.get(EmailProcessor).flush();
  const token = emailToken(app, email, 'Verify your Forma email');
  const server = app.getHttpAdapter().getInstance();
  const verified = await server.inject({
    method: 'POST',
    remoteAddress,
    url: '/api/v1/auth/verify-email',
    headers: csrf,
    payload: { token, password },
  });
  if (verified.statusCode !== 204) throw new Error(verified.body);
  const session = await server.inject({
    method: 'POST',
    remoteAddress,
    url: '/api/v1/auth/login',
    headers: csrf,
    payload: { email, password },
  });
  if (session.statusCode !== 200) throw new Error(session.body);
  return {
    response: session,
    cookie: session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    user: session.json().user as { id: string },
  };
}
export function multipart(bytes = png, type = 'image/png', filename = 'image.png') {
  const boundary = 'forma-test-boundary';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

export function emailMessages(app: TestApp) {
  return app.get<MemoryEmailDelivery>(EMAIL_DELIVERY).messages;
}
export function emailToken(app: TestApp, email: string, subject: string) {
  const message = emailMessages(app)
    .filter((value) => value.to === email.toLowerCase() && value.subject === subject)
    .at(-1);
  const link = message?.text.match(/https?:\/\/[^\s]+/)?.[0];
  if (!link) throw new Error('Expected captured account email');
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
}
