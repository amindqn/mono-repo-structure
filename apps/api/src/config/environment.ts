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
  })
  .superRefine((env, ctx) => {
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
    docsEnabled: env.DOCS_ENABLED ? env.DOCS_ENABLED === 'true' : env.NODE_ENV !== 'production',
  };
}

export type Environment = ReturnType<typeof parseEnvironment>;
