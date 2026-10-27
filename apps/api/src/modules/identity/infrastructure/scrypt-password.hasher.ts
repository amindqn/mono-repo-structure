import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '../domain/security.ports.js';

const cost = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, cost, (error, key) => (error ? reject(error) : resolve(key))),
  );
}
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string) {
    const salt = randomBytes(16);
    const hash = await derive(password, salt);
    return `scrypt$131072$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
  }
  async verify(password: string, encoded: string | null) {
    const parts = encoded?.split('$');
    const valid =
      parts?.length === 6 &&
      parts[0] === 'scrypt' &&
      parts[1] === '131072' &&
      parts[2] === '8' &&
      parts[3] === '1';
    const salt = valid ? Buffer.from(parts[4]!, 'base64url') : Buffer.alloc(16);
    const expected = valid ? Buffer.from(parts[5]!, 'base64url') : Buffer.alloc(64);
    // Unknown accounts still pay the same KDF cost; no fast email-existence branch.
    const actual = await derive(password, salt.length === 16 ? salt : Buffer.alloc(16));
    return Boolean(
      valid && salt.length === 16 && expected.length === 64 && timingSafeEqual(actual, expected),
    );
  }
}
