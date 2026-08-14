import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default('*'),
    DATABASE_URL: z.url().startsWith('postgres').optional(),
    DATABASE_MIGRATION_URL: z.url().startsWith('postgres').optional(),
    AUTH_SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production.',
      });
    }
    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS === '*') {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Explicit CORS origins are required in production.',
      });
    }
  });

export type AppEnvironment = z.infer<typeof envSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): AppEnvironment {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = z.prettifyError(result.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
