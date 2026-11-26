import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Env } from '../config/env.schema';
import {
  GEMINI_MODELS,
  GEMINI_SETTINGS,
  GeminiLlmProvider,
  GeminiSettings,
} from './infrastructure/gemini-llm.provider';
import { LLM_PROVIDER } from './application/ports/llm-provider';
import { RateLimiter } from './infrastructure/rate-limiter';

@Module({
  providers: [
    {
      provide: GEMINI_MODELS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new GoogleGenAI({
          apiKey: config.get('GEMINI_API_KEY', { infer: true }),
          httpOptions: {
            timeout: config.get('GEMINI_TIMEOUT_MS', { infer: true }),
            // Retries live in GeminiLlmProvider only; stacking both would multiply attempts.
            retryOptions: { attempts: 1 },
          },
        }).models,
    },
    {
      provide: GEMINI_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): GeminiSettings => ({
        model: config.get('GEMINI_MODEL', { infer: true }),
        retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 },
        rateLimiter: new RateLimiter(
          config.get('GEMINI_RPM', { infer: true }),
          config.get('GEMINI_MAX_QUEUE_WAIT_MS', { infer: true }),
        ),
      }),
    },
    GeminiLlmProvider,
    { provide: LLM_PROVIDER, useExisting: GeminiLlmProvider },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
