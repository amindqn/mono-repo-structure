import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { MemoryIdentityRepository } from '../dist/modules/identity/infrastructure/memory-identity.repository.js';
import { MemoryEmailDelivery } from '../dist/modules/identity/infrastructure/email-delivery.js';
import { OpaqueActionTokens } from '../dist/modules/identity/infrastructure/opaque-action.tokens.js';
import { EmailActionsService } from '../dist/modules/identity/application/email-actions.service.js';
import { EmailProcessor } from '../dist/modules/identity/application/email-processor.js';
async function fixture() {
  let now = new Date('2026-10-27T00:00:00Z');
  const repository = new MemoryIdentityRepository(() => false);
  const delivery = new MemoryEmailDelivery();
  const tokens = new OpaqueActionTokens();
  const passwords = { hash: async (value: string) => `hashed:${value}`, verify: async () => true };
  const actions = new EmailActionsService(repository, tokens, passwords, randomUUID, () => now);
  const account = {
    id: randomUUID(),
    email: 'unit@example.test',
    emailVerifiedAt: null,
    passwordHash: 'old-hash',
    displayName: 'Unit',
    bio: '',
    role: 'user' as const,
    avatarMediaId: null,
    createdAt: now.toISOString(),
  };
  await repository.register(account, actions.newJob(account.id, 'verify-email'));
  let failDelivery = false;
  let failures = 0;
  const processor = new EmailProcessor(
    repository,
    {
      send: async (message) => {
        if (failDelivery) throw new Error('sensitive SMTP details');
        await delivery.send(message);
      },
    },
    tokens,
    'https://trusted.example',
    randomUUID,
    () => now,
    () => {
      failures++;
    },
  );
  const token = () =>
    new URLSearchParams(
      new URL(delivery.messages.at(-1)!.text.match(/https:\/\/[^\s]+/)![0]).hash.slice(1),
    ).get('token')!;
  return {
    repository,
    delivery,
    tokens,
    actions,
    processor,
    account,
    token,
    get failures() {
      return failures;
    },
    fail: (value: boolean) => {
      failDelivery = value;
    },
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now.toISOString(),
  };
}
it('expires email credentials, separates purposes, and supersedes previous links after the resend cooldown', async () => {
  const f = await fixture();
  await f.processor.flush();
  const first = f.token();
  expect(first).toHaveLength(43);
  expect(f.tokens.hash(first, 'verify-email')).not.toBe(f.tokens.hash(first, 'reset-password'));
  await f.actions.request(f.account.email, 'verify-email');
  await f.processor.flush();
  expect(f.delivery.messages).toHaveLength(1);
  f.advance(61_000);
  await f.actions.request(f.account.email, 'verify-email');
  await f.processor.flush();
  const second = f.token();
  expect(second).not.toBe(first);
  await expect(f.actions.verify(first, 'original-password')).rejects.toMatchObject({ status: 400 });
  f.advance(24 * 3_600_000 + 1);
  await expect(f.actions.verify(second, 'original-password')).rejects.toMatchObject({
    status: 400,
  });
});
it('leases jobs across processors and retries delivery failures without losing the outbox request', async () => {
  const f = await fixture();
  f.fail(true);
  await f.processor.flush();
  expect(f.failures).toBe(1);
  expect(f.delivery.messages).toHaveLength(0);
  await f.processor.flush();
  expect(f.failures).toBe(1);
  f.advance(61_000);
  f.fail(false);
  await Promise.all([f.processor.flush(), f.processor.flush()]);
  expect(f.delivery.messages).toHaveLength(1);
  await f.actions.verify(f.token(), 'original-password');
  expect((await f.repository.findById(f.account.id))?.emailVerifiedAt).toBeTruthy();
});
it('respects the hourly email cap and expires reset links without modifying passwords', async () => {
  const f = await fixture();
  await f.processor.flush();
  await f.actions.verify(f.token(), 'original-password');
  for (let n = 0; n < 6; n++) {
    await f.actions.request(f.account.email, 'reset-password');
    await f.processor.flush();
    f.advance(61_000);
  }
  expect(
    f.delivery.messages.filter((message) => message.subject === 'Reset your Forma password'),
  ).toHaveLength(5);
  const reset = f.token();
  f.advance(30 * 60_000);
  await expect(f.actions.reset(reset, 'new-password-long')).rejects.toMatchObject({ status: 400 });
  expect((await f.repository.findById(f.account.id))?.passwordHash).toBe('old-hash');
});
it('password change invalidates outstanding reset links and cancels queued reset mail', async () => {
  const f = await fixture();
  await f.processor.flush();
  await f.actions.verify(f.token(), 'original-password');
  await f.actions.request(f.account.email, 'reset-password');
  await f.processor.flush();
  const reset = f.token();
  f.advance(61_000);
  await f.actions.request(f.account.email, 'reset-password');
  await f.repository.changePassword(f.account.id, 'old-hash', 'changed-hash', f.now());
  await expect(f.actions.reset(reset, 'new-password-long')).rejects.toMatchObject({ status: 400 });
  await f.processor.flush();
  expect(f.delivery.messages).toHaveLength(2);
});
