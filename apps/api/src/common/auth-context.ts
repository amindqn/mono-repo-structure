import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PublicAccount } from '../modules/identity/domain/identity.js';

export const PUBLIC_ROUTE = 'forma:public';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export type AuthenticatedRequest = FastifyRequest & { user: PublicAccount; sessionId: string };
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user.id,
);
