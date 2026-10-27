import type { FastifyReply } from 'fastify';
import { AUTH_COOKIES } from '@repo/contracts';
import type { Environment } from '../../../config/environment.js';

export class AuthCookies {
  constructor(private readonly env: Environment) {}
  set(
    reply: FastifyReply,
    credentials: { accessToken: string; refreshToken: string; body: { sessionExpiresAt: string } },
  ) {
    const base = { httpOnly: true, secure: this.env.cookieSecure, sameSite: 'lax' as const };
    reply.setCookie(AUTH_COOKIES.access, credentials.accessToken, {
      ...base,
      path: '/api/v1',
      maxAge: this.env.ACCESS_TOKEN_TTL_SECONDS,
    });
    reply.setCookie(AUTH_COOKIES.refresh, credentials.refreshToken, {
      ...base,
      path: '/api/v1/auth',
      maxAge: Math.max(
        0,
        Math.floor((Date.parse(credentials.body.sessionExpiresAt) - Date.now()) / 1000),
      ),
    });
  }
  clear(reply: FastifyReply) {
    const base = { httpOnly: true, secure: this.env.cookieSecure, sameSite: 'lax' as const };
    reply.clearCookie(AUTH_COOKIES.access, { ...base, path: '/api/v1' });
    reply.clearCookie(AUTH_COOKIES.refresh, { ...base, path: '/api/v1/auth' });
  }
}
