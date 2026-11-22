import { LlmUnavailableError } from './llm.errors';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  let now: number;
  const waits: number[] = [];
  const sleep = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };

  beforeEach(() => {
    now = 1_000_000;
    waits.length = 0;
  });

  it('spaces calls evenly to respect the requests-per-minute quota', async () => {
    const limiter = new RateLimiter(15, 60_000, () => now, sleep);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(waits).toEqual([4_000, 8_000]);
  });

  it('does not wait once the interval has passed', async () => {
    const limiter = new RateLimiter(15, 60_000, () => now, sleep);

    await limiter.acquire();
    now += 5_000;
    await limiter.acquire();

    expect(waits).toEqual([]);
  });

  it('rejects instead of queueing longer than the maximum wait', async () => {
    const limiter = new RateLimiter(15, 5_000, () => now, sleep);

    await limiter.acquire();
    await limiter.acquire();
    const rejected = limiter.acquire();

    await expect(rejected).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(rejected).rejects.toMatchObject({ retryAfterMs: 8_000 });
    expect(waits).toEqual([4_000]);
  });
});
