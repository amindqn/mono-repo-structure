import { expect, it } from 'vitest';
import { JoseTokenService } from '../dist/modules/identity/infrastructure/jose-token.service.js';
it('validates signature, expiry, issuer/audience, and opaque refresh entropy', async () => {
  let now = new Date();
  const tokens = new JoseTokenService('x'.repeat(64), 60, () => now);
  const issued = await tokens.createAccess(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
  );
  expect((await tokens.verifyAccess(issued.token)).userId).toBe(
    '11111111-1111-4111-8111-111111111111',
  );
  await expect(
    new JoseTokenService('y'.repeat(64), 60).verifyAccess(issued.token),
  ).rejects.toThrow();
  now = new Date(now.getTime() + 61_000);
  await expect(tokens.verifyAccess(issued.token)).rejects.toThrow();
  const refresh = tokens.createRefresh();
  expect(refresh.token).toHaveLength(43);
  expect(refresh.hash).toHaveLength(64);
  expect(refresh.hash).not.toContain(refresh.token);
});
