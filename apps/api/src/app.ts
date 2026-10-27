import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { Environment } from './config/environment.js';
import { AppModule } from './app.module.js';
import { CSRF_HEADER } from '@repo/contracts';

/** Application factory: initialization is separate from binding a network port. */
export async function createApplication(env: Environment) {
  const adapter = new FastifyAdapter({
    bodyLimit: 16_384,
    requestTimeout: 15_000,
    genReqId: () => randomUUID(),
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: env.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
          },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule.register(env), adapter, {
    logger: env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    throwFileSizeLimit: true,
  });
  await app.register(helmet, env.docsEnabled ? { contentSecurityPolicy: false } : {});
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  adapter.getInstance().addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('cache-control', 'private, no-store');
  });

  if (env.docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Web Platform API')
      .setDescription(
        'Authenticated workspace with rotating sessions, account profiles, and private media storage.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('forma_access', { type: 'apiKey', in: 'cookie' }, 'access')
      .addGlobalParameters({
        in: 'header',
        name: CSRF_HEADER,
        required: false,
        schema: { type: 'string', default: '1' },
      })
      .build();
    const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/openapi.json' });
  }
  await app.init();
  await adapter.getInstance().ready();
  return app;
}
