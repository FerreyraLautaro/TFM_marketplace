import { ApiError } from '@google/genai';

export type FailureKind = 'transient' | 'permanent';

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export function classifyFailure(error: unknown): FailureKind {
  if (error instanceof ApiError) {
    return TRANSIENT_STATUSES.has(error.status) ? 'transient' : 'permanent';
  }
  // Timeouts and dropped connections never reach the API as a status code.
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      (error instanceof TypeError && /fetch failed/i.test(error.message)))
  ) {
    return 'transient';
  }
  return 'permanent';
}

/** Delay requested by the API in a 429 body (google.rpc.RetryInfo, e.g. "retryDelay": "16s"). */
export function serverRetryDelayMs(error: unknown): number | undefined {
  if (!(error instanceof ApiError) || error.status !== 429) {
    return undefined;
  }
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(error.message);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  /** Longer server-requested waits are not worth holding an HTTP request for. */
  maxDelayMs: number;
}

export type RetryDecision =
  | { retry: true; delayMs: number }
  | {
      retry: false;
      reason: 'permanent' | 'attempts-exhausted' | 'delay-too-long';
      retryAfterMs?: number;
    };

export function decideRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): RetryDecision {
  if (classifyFailure(error) === 'permanent') {
    return { retry: false, reason: 'permanent' };
  }
  const serverDelay = serverRetryDelayMs(error);
  if (attempt >= policy.maxAttempts) {
    return {
      retry: false,
      reason: 'attempts-exhausted',
      retryAfterMs: serverDelay,
    };
  }
  if (serverDelay !== undefined) {
    return serverDelay > policy.maxDelayMs
      ? { retry: false, reason: 'delay-too-long', retryAfterMs: serverDelay }
      : { retry: true, delayMs: serverDelay };
  }
  // Exponential backoff with jitter so concurrent clients do not retry in lockstep.
  const exponential = policy.baseDelayMs * 2 ** (attempt - 1);
  const delayMs = Math.round(exponential * (1 + random() * 0.5));
  return { retry: true, delayMs: Math.min(delayMs, policy.maxDelayMs) };
}
