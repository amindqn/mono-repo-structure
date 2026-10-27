import { randomUUID } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Environment } from '../../config/environment.js';
import { IDENTITY_REPOSITORY } from './domain/identity.repository.js';
import type { IdentityRepository } from './domain/identity.repository.js';
import { TOKEN_SERVICE } from './domain/security.ports.js';
import type { TokenService } from './domain/security.ports.js';
import { AuthService } from './application/auth.service.js';
import { ProfileService } from './application/profile.service.js';
import { JoseTokenService } from './infrastructure/jose-token.service.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password.hasher.js';
import { AuthController } from './presentation/auth.controller.js';
import { ProfileController } from './presentation/profile.controller.js';
import { AuthCookies } from './presentation/auth-cookies.js';
import { CsrfGuard, SessionGuard } from './presentation/session.guard.js';
import { ACTION_TOKENS, EMAIL_DELIVERY } from './domain/email.ports.js';
import type { ActionTokens, EmailDelivery } from './domain/email.ports.js';
import { EmailActionsService } from './application/email-actions.service.js';
import { EmailProcessor } from './application/email-processor.js';
import { OpaqueActionTokens } from './infrastructure/opaque-action.tokens.js';
import {
  FileEmailDelivery,
  MemoryEmailDelivery,
  SmtpEmailDelivery,
} from './infrastructure/email-delivery.js';
import { EmailWorker } from './infrastructure/email-worker.js';
import { EmailActionsController } from './presentation/email-actions.controller.js';

@Module({})
export class IdentityModule {
  static register(env: Environment): DynamicModule {
    return {
      module: IdentityModule,
      global: true,
      controllers: [AuthController, ProfileController, EmailActionsController],
      providers: [
        { provide: ACTION_TOKENS, useFactory: () => new OpaqueActionTokens() },
        {
          provide: EMAIL_DELIVERY,
          useFactory: () =>
            env.MAIL_TRANSPORT === 'smtp'
              ? new SmtpEmailDelivery(env)
              : env.MAIL_TRANSPORT === 'memory'
                ? new MemoryEmailDelivery()
                : new FileEmailDelivery(env.MAIL_OUTPUT_DIR),
        },
        {
          provide: EmailActionsService,
          inject: [IDENTITY_REPOSITORY, ACTION_TOKENS],
          useFactory: (repository: IdentityRepository, tokens: ActionTokens) =>
            new EmailActionsService(
              repository,
              tokens,
              new ScryptPasswordHasher(),
              randomUUID,
              () => new Date(),
            ),
        },
        {
          provide: EmailProcessor,
          inject: [IDENTITY_REPOSITORY, EMAIL_DELIVERY, ACTION_TOKENS],
          useFactory: (
            repository: IdentityRepository,
            delivery: EmailDelivery,
            tokens: ActionTokens,
          ) =>
            new EmailProcessor(
              repository,
              delivery,
              tokens,
              env.EMAIL_WEB_ORIGIN,
              randomUUID,
              () => new Date(),
              () =>
                new Logger('EmailOutbox').warn(
                  'Email delivery failed; retry scheduled or attempt limit reached',
                ),
            ),
        },
        {
          provide: EmailWorker,
          inject: [EmailProcessor],
          useFactory: (processor: EmailProcessor) =>
            new EmailWorker(processor, env.NODE_ENV !== 'test', () =>
              new Logger('EmailOutbox').error('Email outbox processing failed'),
            ),
        },
        {
          provide: TOKEN_SERVICE,
          useFactory: () =>
            new JoseTokenService(env.JWT_ACCESS_SECRET, env.ACCESS_TOKEN_TTL_SECONDS),
        },
        { provide: AuthCookies, useFactory: () => new AuthCookies(env) },
        {
          provide: AuthService,
          inject: [IDENTITY_REPOSITORY, TOKEN_SERVICE, EmailActionsService],
          useFactory: (
            repository: IdentityRepository,
            tokens: TokenService,
            emails: EmailActionsService,
          ) =>
            new AuthService(
              repository,
              new ScryptPasswordHasher(),
              tokens,
              randomUUID,
              () => new Date(),
              env.REFRESH_TOKEN_TTL_SECONDS,
              emails,
            ),
        },
        {
          provide: ProfileService,
          inject: [IDENTITY_REPOSITORY],
          useFactory: (repository: IdentityRepository) => new ProfileService(repository),
        },
        {
          provide: SessionGuard,
          inject: [IDENTITY_REPOSITORY, TOKEN_SERVICE, Reflector],
          useFactory: (
            repository: IdentityRepository,
            tokens: TokenService,
            reflector: Reflector,
          ) => new SessionGuard(repository, tokens, reflector),
        },
        { provide: CsrfGuard, useFactory: () => new CsrfGuard(env.TRUSTED_ORIGINS) },
      ],
      exports: [SessionGuard, CsrfGuard, TOKEN_SERVICE],
    };
  }
}
