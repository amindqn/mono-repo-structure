import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    PERSISTENCE: z.enum(['memory', 'postgres']).default('memory'),
    DATABASE_URL: z
      .url()
      .refine(
        (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        'Use a PostgreSQL connection URL',
      )
      .optional(),
    DOCS_ENABLED: z.enum(['true', 'false']).optional(),
    JWT_ACCESS_SECRET: z.string().min(32).optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2_592_000).default(604_800),
    COOKIE_SECURE: z.enum(['true', 'false']).optional(),
    MAIL_TRANSPORT: z.enum(['file', 'memory', 'smtp']).optional(),
    EMAIL_FROM: z.email().optional(),
    EMAIL_WEB_ORIGIN: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
      }, 'Use an exact HTTP(S) origin')
      .optional(),
    MAIL_OUTPUT_DIR: z.string().min(1).default('output/mail'),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_REQUIRE_TLS: z.enum(['true', 'false']).default('true'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    TRUSTED_ORIGINS: z
      .string()
      .default(
        'http://localhost:3000,http://127.0.0.1:3000,http://localhost:4000,http://127.0.0.1:4000',
      )
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(
        z
          .array(
            z.url().refine((value) => {
              const url = new URL(value);
              return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
            }, 'Use exact HTTP(S) origins'),
          )
          .min(1),
      ),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_ENDPOINT: z
      .url()
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
      .optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.MAIL_TRANSPORT !== 'smtp' ||
        !env.EMAIL_FROM ||
        !env.EMAIL_WEB_ORIGIN?.startsWith('https://') ||
        env.SMTP_REQUIRE_TLS === 'false')
    )
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message:
          'Production requires SMTP, EMAIL_FROM, an HTTPS EMAIL_WEB_ORIGIN, and TLS for email delivery',
      });
    if (env.MAIL_TRANSPORT === 'smtp' && !env.SMTP_HOST)
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required for SMTP delivery',
      });
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'Provide both SMTP_USER and SMTP_PASSWORD',
      });
    if (env.MAIL_TRANSPORT === 'memory' && env.NODE_ENV !== 'test')
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_TRANSPORT'],
        message: 'Memory email delivery is restricted to tests',
      });
    if (
      env.NODE_ENV === 'production' &&
      (!env.JWT_ACCESS_SECRET || env.COOKIE_SECURE === 'false')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Production requires a private signing secret and Secure cookies',
      });
    }
    if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY))
      ctx.addIssue({
        code: 'custom',
        path: ['S3_ACCESS_KEY_ID'],
        message: 'Supply both object-store credentials or use the default AWS credential chain',
      });
    if (env.S3_BUCKET && env.PERSISTENCE !== 'postgres')
      ctx.addIssue({
        code: 'custom',
        path: ['PERSISTENCE'],
        message: 'Object storage requires PostgreSQL for durable ownership metadata',
      });
    if (env.NODE_ENV === 'production' && env.PERSISTENCE !== 'postgres') {
      ctx.addIssue({
        code: 'custom',
        path: ['PERSISTENCE'],
        message: 'Production requires postgres persistence',
      });
    }
    if (env.PERSISTENCE === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'Required for postgres persistence',
      });
    }
  });

export function parseEnvironment(input: Record<string, unknown>) {
  const env = schema.parse(input);
  return {
    ...env,
    MAIL_TRANSPORT: env.MAIL_TRANSPORT ?? (env.NODE_ENV === 'test' ? 'memory' : 'file'),
    EMAIL_FROM: env.EMAIL_FROM ?? 'no-reply@example.test',
    EMAIL_WEB_ORIGIN: env.EMAIL_WEB_ORIGIN ?? 'http://localhost:3000',
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? randomBytes(32).toString('hex'),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',
    docsEnabled: env.DOCS_ENABLED ? env.DOCS_ENABLED === 'true' : env.NODE_ENV !== 'production',
  };
}

export type Environment = ReturnType<typeof parseEnvironment>;
