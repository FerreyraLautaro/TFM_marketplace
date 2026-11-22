export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export interface StructuredGenerationRequest {
  systemInstruction: string;
  prompt: string;
  /** JSON Schema the model output must follow. */
  jsonSchema: Record<string, unknown>;
}

export interface StructuredGenerationResult {
  /** Raw model output. It is untrusted: callers must parse and validate it. */
  rawText: string;
  model: string;
  attempts: number;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

/**
 * Vendor-neutral access to an LLM. Retries, timeouts and rate limiting live in
 * the implementation, so callers only deal with a result or a typed error.
 */
export interface LlmProvider {
  generateStructured(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult>;
}
