import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApplication } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/environment.js';
import { EmailProcessor } from '../dist/modules/identity/application/email-processor.js';
import { csrf, emailMessages, emailToken, password, register } from './helpers.js';
import type { TestApp } from './helpers.js';
let app: TestApp;
beforeEach(async () => {
  app = await createApplication(parseEnvironment({ NODE_ENV: 'test' }));
});
afterEach(async () => {
  await app?.close();
});
const post = (path: string, payload: Record<string, unknown>) =>
  app
    .getHttpAdapter()
    .getInstance()
    .inject({ method: 'POST', url: `/api/v1/auth/${path}`, headers: csrf, payload });
it('requires single-use email confirmation before login and never issues cookies from registration or verification', async () => {
  const input = { email: 'Verify@example.test', password, displayName: 'Verify me' };
  const created = await post('register', input);
  const duplicate = await post('register', { ...input, password: 'another-long-password' });
  expect(created.statusCode).toBe(202);
  expect(duplicate.json()).toEqual(created.json());
  expect(created.cookies).toHaveLength(0);
  expect(created.body).not.toContain('token');
  expect((await post('login', { email: input.email, password })).statusCode).toBe(403);
  expect((await post('login', { email: input.email, password: 'wrong' })).statusCode).toBe(401);
  expect(
    (await post('register', { ...input, emailVerifiedAt: new Date().toISOString() })).statusCode,
  ).toBe(400);
  await app.get(EmailProcessor).flush();
  const token = emailToken(app, input.email, 'Verify your Forma email');
  expect(
    (await post('reset-password', { token, newPassword: 'replacement-long-password' })).statusCode,
  ).toBe(400);
  const verified = await post('verify-email', { token, password });
  expect(verified.statusCode).toBe(204);
  expect(verified.cookies).toHaveLength(0);
  expect((await post('verify-email', { token, password })).statusCode).toBe(400);
  const login = await post('login', { email: input.email, password });
  expect(login.statusCode).toBe(200);
  expect(login.json().user.emailVerifiedAt).toBeTruthy();
});
it('returns generic recovery responses, throttles email by account, consumes reset once, and revokes access and refresh sessions', async () => {
  const email = 'recover@example.test';
  const { cookie } = await register(app, email);
  const known = await post('forgot-password', { email });
  const missing = await post('forgot-password', { email: 'missing@example.test' });
  const again = await post('forgot-password', { email });
  expect([known.statusCode, missing.statusCode, again.statusCode]).toEqual([202, 202, 202]);
  expect(known.json()).toEqual(missing.json());
  expect(known.cookies).toHaveLength(0);
  await app.get(EmailProcessor).flush();
  expect(
    emailMessages(app).filter((message) => message.subject === 'Reset your Forma password'),
  ).toHaveLength(1);
  const token = emailToken(app, email, 'Reset your Forma password');
  expect((await post('verify-email', { token, password })).statusCode).toBe(400);
  const reset = await post('reset-password', { token, newPassword: 'replacement-long-password' });
  expect(reset.statusCode).toBe(204);
  expect(reset.cookies.every((value) => !value.value)).toBe(true);
  expect(
    (await post('reset-password', { token, newPassword: 'another-long-password' })).statusCode,
  ).toBe(400);
  const server = app.getHttpAdapter().getInstance();
  expect(
    (await server.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } }))
      .statusCode,
  ).toBe(401);
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { ...csrf, cookie },
      })
    ).statusCode,
  ).toBe(401);
  expect((await post('login', { email, password })).statusCode).toBe(401);
  expect((await post('login', { email, password: 'replacement-long-password' })).statusCode).toBe(
    200,
  );
  await app.get(EmailProcessor).flush();
  expect(
    emailMessages(app).some(
      (message) =>
        message.subject === 'Your Forma password was reset' &&
        !message.text.includes(token) &&
        !message.text.includes('replacement-long-password'),
    ),
  ).toBe(true);
});
it('keeps recovery and resend public but enforces strict input, CSRF, origins, and eligibility', async () => {
  const email = 'pending@example.test';
  await post('register', { email, password, displayName: 'Pending account' });
  const server = app.getHttpAdapter().getInstance();
  for (const path of ['forgot-password', 'resend-verification']) {
    expect((await post(path, { email: 'not an email' })).statusCode).toBe(400);
    expect(
      (await server.inject({ method: 'POST', url: `/api/v1/auth/${path}`, payload: { email } }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: `/api/v1/auth/${path}`,
          headers: { ...csrf, origin: 'https://hostile.example' },
          payload: { email },
        })
      ).statusCode,
    ).toBe(403);
  }
  expect((await post('forgot-password', { email })).statusCode).toBe(202);
  expect((await post('resend-verification', { email: 'absent@example.test' })).statusCode).toBe(
    202,
  );
  expect((await post('verify-email', { token: 'short' })).statusCode).toBe(400);
  await app.get(EmailProcessor).flush();
  expect(emailMessages(app)).toHaveLength(2);
  expect(emailMessages(app)[0]?.subject).toBe('Verify your Forma email');
});
it('requires an HTTPS email origin and TLS SMTP in production and keeps test capture out of development', () => {
  const production = {
    NODE_ENV: 'production',
    PERSISTENCE: 'postgres',
    DATABASE_URL: 'postgresql://example/app',
    JWT_ACCESS_SECRET: 'x'.repeat(64),
    MAIL_TRANSPORT: 'smtp',
    EMAIL_WEB_ORIGIN: 'https://app.example.com',
    EMAIL_FROM: 'security@example.com',
    SMTP_HOST: 'smtp.example.com',
  };
  expect(parseEnvironment(production).MAIL_TRANSPORT).toBe('smtp');
  for (const override of [
    { MAIL_TRANSPORT: 'file' },
    { SMTP_REQUIRE_TLS: 'false' },
    { EMAIL_WEB_ORIGIN: 'http://app.example.com' },
    { SMTP_HOST: undefined },
  ])
    expect(() => parseEnvironment({ ...production, ...override })).toThrow();
  expect(() => parseEnvironment({ MAIL_TRANSPORT: 'memory' })).toThrow();
});
it('prevents activating an unknown signup password and lets the email owner recover a pending account', async () => {
  const email = 'reserved@example.test';
  await post('register', { email, password, displayName: 'Reserved account' });
  await app.get(EmailProcessor).flush();
  const token = emailToken(app, email, 'Verify your Forma email');
  expect(
    (await post('verify-email', { token, password: 'email-owner-chosen-password' })).statusCode,
  ).toBe(400);
  expect((await post('forgot-password', { email })).statusCode).toBe(202);
  await app.get(EmailProcessor).flush();
  const reset = emailToken(app, email, 'Reset your Forma password');
  const replacement = 'email-owner-chosen-password';
  expect(
    (await post('reset-password', { token: reset, newPassword: replacement })).statusCode,
  ).toBe(204);
  expect((await post('login', { email, password: replacement })).statusCode).toBe(403);
  expect((await post('verify-email', { token, password })).statusCode).toBe(400);
  expect((await post('verify-email', { token, password: replacement })).statusCode).toBe(204);
  expect((await post('login', { email, password: replacement })).statusCode).toBe(200);
});
