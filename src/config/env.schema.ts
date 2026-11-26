import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().default(3000),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: z.coerce.number().positive().int().default(5432),
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_DB: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    // Access token lifetime in seconds.
    JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),
    // Shared with the payment provider to sign webhooks (HMAC-SHA256).
    PAYMENT_WEBHOOK_SECRET: z.string().min(32),
    GEMINI_API_KEY: z.string().min(1),
    GEMINI_MODEL: z.string().min(1),
    GEMINI_RPM: z.coerce.number().int().positive().default(15),
    GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    GEMINI_MAX_QUEUE_WAIT_MS: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(10_000),
    // Demo data loaded on startup; passwords come from the environment, never from the repo.
    SEED_DEMO_DATA: z.stringbool().default(false),
    SEED_BUYER_PASSWORD: z.string().min(8).optional(),
    SEED_SELLER_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.SEED_DEMO_DATA) {
      return;
    }
    for (const key of [
      'SEED_BUYER_PASSWORD',
      'SEED_SELLER_PASSWORD',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when SEED_DEMO_DATA is true`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
