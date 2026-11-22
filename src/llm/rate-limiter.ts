import { LlmUnavailableError } from './llm.errors';

/**
 * Spaces calls evenly to stay under a requests-per-minute quota. The limit is
 * per process: several app instances would each get the full quota, so a shared
 * store (e.g. Redis) would be needed to scale out.
 */
export class RateLimiter {
  private nextSlotAt = 0;
  private readonly intervalMs: number;

  constructor(
    requestsPerMinute: number,
    private readonly maxWaitMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    this.intervalMs = Math.ceil(60_000 / requestsPerMinute);
  }

  async acquire(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlotAt);
    const waitMs = slot - now;
    // Backpressure: refuse instead of queueing a request for longer than a client would wait.
    if (waitMs > this.maxWaitMs) {
      throw new LlmUnavailableError(
        'LLM rate limit reached, try again later',
        0,
        waitMs,
      );
    }
    // The slot is reserved before awaiting, so concurrent callers get distinct slots.
    this.nextSlotAt = slot + this.intervalMs;
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
