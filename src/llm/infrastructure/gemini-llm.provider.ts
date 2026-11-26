import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GoogleGenAI } from '@google/genai';
import {
  LlmRequestError,
  LlmUnavailableError,
} from '../application/ports/llm.errors';
import {
  LlmProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../application/ports/llm-provider';
import { RateLimiter, defaultSleep } from './rate-limiter';
import { RetryPolicy, decideRetry } from './retry';

export const GEMINI_MODELS = Symbol('GEMINI_MODELS');
export const GEMINI_SETTINGS = Symbol('GEMINI_SETTINGS');

export type GeminiModels = Pick<GoogleGenAI['models'], 'generateContent'>;

export interface GeminiSettings {
  model: string;
  retry: RetryPolicy;
  rateLimiter: RateLimiter;
  sleep?: (ms: number) => Promise<void>;
}

@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);

  constructor(
    @Inject(GEMINI_MODELS) private readonly models: GeminiModels,
    @Inject(GEMINI_SETTINGS) private readonly settings: GeminiSettings,
  ) {}

  async generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult> {
    const { model, retry, rateLimiter } = this.settings;
    const sleep = this.settings.sleep ?? defaultSleep;
    const startedAt = Date.now();

    for (let attempt = 1; ; attempt++) {
      await rateLimiter.acquire();
      try {
        const response = await this.models.generateContent({
          model,
          contents: request.prompt,
          config: {
            systemInstruction: request.systemInstruction,
            responseMimeType: 'application/json',
            responseJsonSchema: request.jsonSchema,
            // Extraction, not creativity: the same input should give the same output.
            temperature: 0,
          },
        });
        return {
          // An empty text (e.g. a safety block) is returned as-is and fails validation downstream.
          rawText: response.text ?? '',
          model,
          attempts: attempt,
          latencyMs: Date.now() - startedAt,
          usage: {
            inputTokens: response.usageMetadata?.promptTokenCount ?? null,
            outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
          },
        };
      } catch (error) {
        const decision = decideRetry(error, attempt, retry);
        const reason = error instanceof Error ? error.message : String(error);
        if (decision.retry) {
          this.logger.warn(
            `Attempt ${attempt} failed, retrying in ${decision.delayMs} ms: ${reason}`,
          );
          await sleep(decision.delayMs);
          continue;
        }
        this.logger.error(
          `LLM call failed after ${attempt} attempt(s) (${decision.reason}): ${reason}`,
        );
        throw decision.reason === 'permanent'
          ? new LlmRequestError('LLM request rejected', attempt, {
              cause: error,
            })
          : new LlmUnavailableError(
              'LLM unavailable',
              attempt,
              decision.retryAfterMs,
              { cause: error },
            );
      }
    }
  }
}
