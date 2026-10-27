import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { TokenService } from '../domain/security.ports.js';

export class JoseTokenService implements TokenService {
  private readonly key: Uint8Array;
  constructor(
    secret: string,
    private readonly ttlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = new TextEncoder().encode(secret);
  }
  async createAccess(userId: string, sessionId: string) {
    const now = Math.floor(this.now().getTime() / 1000);
    const expires = now + this.ttlSeconds;
    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuer('forma-api')
      .setAudience('forma-web')
      .setIssuedAt(now)
      .setExpirationTime(expires)
      .sign(this.key);
    return { token, expiresAt: new Date(expires * 1000).toISOString() };
  }
  async verifyAccess(token: string) {
    const { payload } = await jwtVerify(token, this.key, {
      issuer: 'forma-api',
      audience: 'forma-web',
      algorithms: ['HS256'],
      typ: 'JWT',
      currentDate: this.now(),
      requiredClaims: ['sub', 'sid', 'exp', 'iat'],
    });
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.exp !== 'number'
    )
      throw new Error('Invalid token claims');
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(payload.sub) || !uuid.test(payload.sid))
      throw new Error('Invalid token subject');
    return { userId: payload.sub, sessionId: payload.sid, expiresAt: payload.exp };
  }
  createRefresh() {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefresh(token) };
  }
  hashRefresh(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
