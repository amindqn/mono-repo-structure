import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AUTH_COOKIES, CSRF_HEADER } from '@repo/contracts';
import { PUBLIC_ROUTE } from '../../../common/auth-context.js';
import type { AuthenticatedRequest } from '../../../common/auth-context.js';
import type { IdentityRepository } from '../domain/identity.repository.js';
import type { TokenService } from '../domain/security.ports.js';
import type { AccessIdentity } from '../domain/security.ports.js';
import { publicAccount } from '../domain/identity.js';

export class SessionGuard implements CanActivate {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : request.cookies[AUTH_COOKIES.access];
    if (!token) throw new UnauthorizedException('Please sign in');
    let identity: AccessIdentity;
    try {
      identity = await this.tokens.verifyAccess(token);
    } catch {
      throw new UnauthorizedException('Please sign in again');
    }
    // Keep database errors outside the verification catch so an outage cannot masquerade as logout.
    const account = await this.repository.activeAccount(
      identity.userId,
      identity.sessionId,
      new Date().toISOString(),
    );
    if (!account) throw new UnauthorizedException('Please sign in again');
    request.user = publicAccount(account);
    request.sessionId = identity.sessionId;
    return true;
  }
}

export class CsrfGuard implements CanActivate {
  constructor(private readonly origins: readonly string[]) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (request.headers[CSRF_HEADER] !== '1')
      throw new ForbiddenException('CSRF protection header is required');
    if (request.headers.origin && !this.origins.includes(request.headers.origin))
      throw new ForbiddenException('Origin is not allowed');
    return true;
  }
}
