import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { createDatabase } from '../dist/infrastructure/database/connection.js';
import {
  media,
  actionCredentials,
  emailOutbox,
  refreshCredentials,
  sessions,
  users,
} from '../dist/infrastructure/database/schema.js';
import { createApplication } from '../dist/app.js';
import { parseEnvironment } from '../dist/config/environment.js';
import { csrf, emailToken, multipart, password, png, register } from './helpers.js';
import { EmailProcessor } from '../dist/modules/identity/application/email-processor.js';
import { IDENTITY_REPOSITORY } from '../dist/modules/identity/domain/identity.repository.js';
import type { IdentityRepository } from '../dist/modules/identity/domain/identity.repository.js';
import { OpaqueActionTokens } from '../dist/modules/identity/infrastructure/opaque-action.tokens.js';
import type { TestApp } from './helpers.js';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database');
const { db, pool } = createDatabase(url);
const env = parseEnvironment({
  NODE_ENV: 'test',
  PERSISTENCE: 'postgres',
  DATABASE_URL: url,
  JWT_ACCESS_SECRET: 'integration-only-private-signing-secret-1234567890',
});
let app: TestApp;
const createdUsers: string[] = [];
async function account(application = app) {
  const result = await register(application, `${randomUUID()}@example.test`);
  createdUsers.push(result.user.id);
  return result;
}
const cookieOf = (response: { cookies: Array<{ name: string; value: string }> }) =>
  response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  app = await createApplication(env);
});
afterAll(async () => {
  try {
    await app?.close();
    for (const id of createdUsers) await db.delete(users).where(eq(users.id, id));
  } finally {
    await pool.end();
  }
});

it('persists profiles, hashed credentials, tasks, and bytea media through an app restart', async () => {
  const { cookie, user, response } = await account();
  const server = app.getHttpAdapter().getInstance();
  const task = await server.inject({
    method: 'POST',
    url: '/api/v1/tasks',
    headers: { ...csrf, cookie },
    payload: { title: 'Persisted task' },
  });
  expect(task.statusCode).toBe(201);
  const form = multipart();
  const upload = await server.inject({
    method: 'POST',
    url: '/api/v1/media/upload',
    headers: { ...form.headers, ...csrf, cookie },
    payload: form.payload,
  });
  expect(upload.statusCode).toBe(201);
  const profile = await server.inject({
    method: 'PATCH',
    url: '/api/v1/users/me',
    headers: { ...csrf, cookie },
    payload: {
      displayName: 'Persisted name',
      bio: 'PostgreSQL profile',
      avatarMediaId: upload.json().id,
    },
  });
  expect(profile.statusCode).toBe(200);
  const [stored] = await db.select().from(users).where(eq(users.id, user.id));
  expect(stored?.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
  expect(stored?.passwordHash).not.toContain(password);
  const [storedSession] = await db.select().from(sessions).where(eq(sessions.userId, user.id));
  const credentials = await db
    .select()
    .from(refreshCredentials)
    .where(eq(refreshCredentials.sessionId, storedSession!.id));
  expect(credentials.every((credential) => /^[0-9a-f]{64}$/.test(credential.hash))).toBe(true);
  expect(credentials[0]?.hash).not.toBe(
    response.cookies.find((cookie) => cookie.name === 'forma_refresh')?.value,
  );
  const [storedMedia] = await db.select().from(media).where(eq(media.id, upload.json().id));
  expect(Buffer.from(storedMedia!.data!).equals(png)).toBe(true);
  await app.close();
  app = await createApplication(env);
  const next = app.getHttpAdapter().getInstance();
  expect(
    (await next.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).json()
      .displayName,
  ).toBe('Persisted name');
  expect(
    (await next.inject({ method: 'GET', url: '/api/v1/tasks', headers: { cookie } })).json()
      .items[0].id,
  ).toBe(task.json().id);
  expect(
    (
      await next.inject({
        method: 'GET',
        url: `/api/v1/media/${upload.json().id}/content`,
        headers: { cookie },
      })
    ).rawPayload.equals(png),
  ).toBe(true);
  expect(
    (
      await next.inject({
        method: 'DELETE',
        url: `/api/v1/media/${upload.json().id}`,
        headers: { ...csrf, cookie },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (await next.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })).json()
      .avatarMediaId,
  ).toBeNull();
});
it('serializes concurrent refresh reuse and commits session-family revocation', async () => {
  const { cookie, user } = await account();
  const server = app.getHttpAdapter().getInstance();
  const attempts = await Promise.all(
    [1, 2].map(() =>
      server.inject({ method: 'POST', url: '/api/v1/auth/refresh', headers: { ...csrf, cookie } }),
    ),
  );
  expect(attempts.map((response) => response.statusCode).sort()).toEqual([200, 401]);
  const success = attempts.find((response) => response.statusCode === 200)!;
  expect(
    (
      await server.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: cookieOf(success) },
      })
    ).statusCode,
  ).toBe(401);
  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, user.id)))[0]?.revokedAt,
  ).not.toBeNull();
});
it('enforces the media quota atomically under concurrent uploads', async () => {
  const { cookie, user } = await account();
  await db.insert(media).values(
    Array.from({ length: 99 }, () => ({
      id: randomUUID(),
      ownerId: user.id,
      filename: 'quota.png',
      contentType: 'image/png',
      size: png.length,
      storage: 'database' as const,
      data: png,
      createdAt: new Date(),
    })),
  );
  const uploads = await Promise.all(
    [1, 2].map(() => {
      const form = multipart();
      return app
        .getHttpAdapter()
        .getInstance()
        .inject({
          method: 'POST',
          url: '/api/v1/media/upload',
          headers: { ...form.headers, ...csrf, cookie },
          payload: form.payload,
        });
    }),
  );
  expect(uploads.map((response) => response.statusCode).sort()).toEqual([201, 413]);
  expect(
    await db.select({ id: media.id }).from(media).where(eq(media.ownerId, user.id)),
  ).toHaveLength(100);
});
it('changes passwords and revokes persisted sessions in one transaction', async () => {
  const { cookie, user } = await account();
  const server = app.getHttpAdapter().getInstance();
  expect(
    (
      await server.inject({
        method: 'POST',
        url: '/api/v1/auth/password',
        headers: { ...csrf, cookie },
        payload: { currentPassword: password, newPassword: 'replacement-long-password' },
      })
    ).statusCode,
  ).toBe(204);
  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, user.id))).every(
      (session) => session.revokedAt !== null,
    ),
  ).toBe(true);
  expect(
    (await server.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } }))
      .statusCode,
  ).toBe(401);
});

it.skipIf(!process.env.TEST_S3_ENDPOINT)(
  'round trips object storage and removes an object if metadata/quota persistence fails',
  async () => {
    const endpoint = process.env.TEST_S3_ENDPOINT;
    if (!endpoint) throw new Error('TEST_S3_ENDPOINT is required');
    const s3Environment = {
      ...env,
      S3_ENDPOINT: endpoint,
      S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'foundation-test',
      S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY ?? 'S3RVER',
      S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_KEY ?? 'S3RVER',
    };
    const objectApp = await createApplication(s3Environment);
    const client = new S3Client({
      endpoint: s3Environment.S3_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: s3Environment.S3_ACCESS_KEY_ID,
        secretAccessKey: s3Environment.S3_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    try {
      const { cookie, user } = await account(objectApp);
      const form = multipart();
      const server = objectApp.getHttpAdapter().getInstance();
      const upload = await server.inject({
        method: 'POST',
        url: '/api/v1/media/upload?storage=object',
        headers: { ...form.headers, ...csrf, cookie },
        payload: form.payload,
      });
      expect(upload.statusCode).toBe(201);
      const id = upload.json().id;
      expect((await db.select().from(media).where(eq(media.id, id)))[0]?.data).toBeNull();
      expect(
        (
          await server.inject({
            method: 'GET',
            url: `/api/v1/media/${id}/content`,
            headers: { cookie },
          })
        ).rawPayload.equals(png),
      ).toBe(true);
      expect(
        (
          await server.inject({
            method: 'DELETE',
            url: `/api/v1/media/${id}`,
            headers: { ...csrf, cookie },
          })
        ).statusCode,
      ).toBe(204);
      await expect(
        client.send(
          new GetObjectCommand({
            Bucket: s3Environment.S3_BUCKET,
            Key: `private/${user.id}/${id}`,
          }),
        ),
      ).rejects.toThrow();
      await db.insert(media).values(
        Array.from({ length: 100 }, () => ({
          id: randomUUID(),
          ownerId: user.id,
          filename: 'quota.png',
          contentType: 'image/png',
          size: png.length,
          storage: 'database' as const,
          data: png,
          createdAt: new Date(),
        })),
      );
      const rejected = await server.inject({
        method: 'POST',
        url: '/api/v1/media/upload?storage=object',
        headers: { ...form.headers, ...csrf, cookie },
        payload: form.payload,
      });
      expect(rejected.statusCode).toBe(413);
      const objects = await client.send(
        new ListObjectsV2Command({
          Bucket: s3Environment.S3_BUCKET,
          Prefix: `private/${user.id}/`,
        }),
      );
      expect(objects.Contents ?? []).toHaveLength(0);
    } finally {
      await objectApp.close();
      client.destroy();
    }
  },
);

it('persists the outbox through restart and consumes verification/reset exactly once under concurrent requests', async () => {
  const email = `${randomUUID()}@example.test`;
  const post = (path: string, payload: Record<string, unknown>, cookie?: string) =>
    app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        remoteAddress: '127.0.2.10',
        url: `/api/v1/auth/${path}`,
        headers: { ...csrf, ...(cookie ? { cookie } : {}) },
        payload,
      });
  expect(
    (await post('register', { email, password, displayName: 'Persisted inbox' })).statusCode,
  ).toBe(202);
  const [account] = await db.select().from(users).where(eq(users.email, email));
  createdUsers.push(account!.id);
  expect(account?.emailVerifiedAt).toBeNull();
  expect((await post('login', { email, password })).statusCode).toBe(403);
  expect(await db.select().from(sessions).where(eq(sessions.userId, account!.id))).toHaveLength(0);
  await app.close();
  app = await createApplication(env);
  await app.get(EmailProcessor).flush();
  const verifyToken = emailToken(app, email, 'Verify your Forma email');
  const stored = await db
    .select()
    .from(actionCredentials)
    .where(eq(actionCredentials.userId, account!.id));
  expect(stored).toHaveLength(1);
  expect(stored[0]?.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(stored)).not.toContain(verifyToken);
  const jobs = await db.select().from(emailOutbox).where(eq(emailOutbox.userId, account!.id));
  expect(JSON.stringify(jobs)).not.toContain(verifyToken);
  expect(
    (
      await Promise.all([
        post('verify-email', { token: verifyToken, password }),
        post('verify-email', { token: verifyToken, password }),
      ])
    )
      .map((value) => value.statusCode)
      .sort(),
  ).toEqual([204, 400]);
  const login = await post('login', { email, password });
  expect(login.statusCode).toBe(200);
  const cookie = cookieOf(login);
  await post('forgot-password', { email });
  await app.get(EmailProcessor).flush();
  const resetToken = emailToken(app, email, 'Reset your Forma password');
  const attempts = await Promise.all([
    post('reset-password', { token: resetToken, newPassword: 'concurrent-new-password-a' }),
    post('reset-password', { token: resetToken, newPassword: 'concurrent-new-password-b' }),
  ]);
  expect(attempts.map((value) => value.statusCode).sort()).toEqual([204, 400]);
  expect(
    (await db.select().from(sessions).where(eq(sessions.userId, account!.id))).every(
      (value) => value.revokedAt,
    ),
  ).toBe(true);
  expect((await post('refresh', {}, cookie)).statusCode).toBe(401);
  expect(
    await db.select().from(actionCredentials).where(eq(actionCredentials.userId, account!.id)),
  ).toHaveLength(0);
  const notices = (
    await db.select().from(emailOutbox).where(eq(emailOutbox.userId, account!.id))
  ).filter((value) => value.kind === 'password-reset-notice');
  expect(notices).toHaveLength(1);
  await app.get(EmailProcessor).flush();
});
it('recovers expired outbox leases and rejects a stale worker before issuing action credentials', async () => {
  const email = `${randomUUID()}@example.test`;
  const server = app.getHttpAdapter().getInstance();
  expect(
    (
      await server.inject({
        method: 'POST',
        remoteAddress: '127.0.2.11',
        url: '/api/v1/auth/register',
        headers: csrf,
        payload: { email, password, displayName: 'Lease test' },
      })
    ).statusCode,
  ).toBe(202);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  createdUsers.push(user!.id);
  const repository = app.get<IdentityRepository>(IDENTITY_REPOSITORY);
  const now = new Date();
  const next = new Date(now.getTime() + 120_000).toISOString();
  const first = await repository.claimEmail(now.toISOString(), randomUUID(), next);
  expect(first?.userId).toBe(user!.id);
  expect(await repository.claimEmail(now.toISOString(), randomUUID(), next)).toBeNull();
  await db
    .update(emailOutbox)
    .set({ leaseUntil: new Date(now.getTime() - 1000) })
    .where(eq(emailOutbox.id, first!.id));
  const second = await repository.claimEmail(now.toISOString(), randomUUID(), next);
  expect(second?.id).toBe(first?.id);
  expect(second?.leaseId).not.toBe(first?.leaseId);
  const token = new OpaqueActionTokens().create('verify-email');
  const credential = {
    hash: token.hash,
    userId: user!.id,
    purpose: 'verify-email' as const,
    createdAt: now.toISOString(),
    expiresAt: next,
  };
  expect(await repository.prepareEmailAction(first!, credential, now.toISOString())).toBe(false);
  expect(await repository.prepareEmailAction(second!, credential, now.toISOString())).toBe(true);
  await repository.finishEmail(first!, now.toISOString(), null);
  expect(
    (await db.select().from(emailOutbox).where(eq(emailOutbox.id, first!.id)))[0]?.finishedAt,
  ).toBeNull();
  await repository.finishEmail(second!, now.toISOString(), null);
  await db
    .update(users)
    .set({ passwordHash: 'changed-after-password-check' })
    .where(eq(users.id, user!.id));
  expect(await repository.verifyEmail(token.hash, user!.passwordHash, now.toISOString())).toBe(
    false,
  );
  expect(
    await repository.verifyEmail(token.hash, 'changed-after-password-check', now.toISOString()),
  ).toBe(true);
});
it('rejects expired persisted reset credentials without modifying passwords, and locks legacy unverified sessions', async () => {
  const { user, cookie } = await account();
  const repository = app.get<IdentityRepository>(IDENTITY_REPOSITORY);
  const tokens = new OpaqueActionTokens();
  const token = tokens.create('reset-password');
  await db.insert(actionCredentials).values({
    hash: token.hash,
    userId: user.id,
    purpose: 'reset-password',
    createdAt: new Date(Date.now() - 3600_000),
    expiresAt: new Date(Date.now() - 1000),
  });
  const before = (await repository.findById(user.id))!.passwordHash;
  const response = await app
    .getHttpAdapter()
    .getInstance()
    .inject({
      method: 'POST',
      remoteAddress: '127.0.2.12',
      url: '/api/v1/auth/reset-password',
      headers: csrf,
      payload: { token: token.token, newPassword: 'expired-link-password' },
    });
  expect(response.statusCode).toBe(400);
  expect((await repository.findById(user.id))?.passwordHash).toBe(before);
  await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, user.id));
  expect(
    (
      await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } })
    ).statusCode,
  ).toBe(401);
  expect(
    await repository.activeAccount(
      user.id,
      (await db.select().from(sessions).where(eq(sessions.userId, user.id)))[0]!.id,
      new Date().toISOString(),
    ),
  ).toBeNull();
});
