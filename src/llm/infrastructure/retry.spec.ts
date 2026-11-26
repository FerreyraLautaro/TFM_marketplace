import { ApiError } from '@google/genai';
import { classifyFailure, decideRetry, serverRetryDelayMs } from './retry';

const policy = { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 };
const apiError = (status: number, message = 'error') =>
  new ApiError({ status, message });

describe('classifyFailure', () => {
  it.each([408, 429, 500, 502, 503, 504])(
    'treats %i as transient',
    (status) => {
      expect(classifyFailure(apiError(status))).toBe('transient');
    },
  );

  it.each([400, 401, 403, 404])('treats %i as permanent', (status) => {
    expect(classifyFailure(apiError(status))).toBe('permanent');
  });

  it('treats timeouts and dropped connections as transient', () => {
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyFailure(timeout)).toBe('transient');
    expect(classifyFailure(abort)).toBe('transient');
    expect(classifyFailure(new TypeError('fetch failed'))).toBe('transient');
  });

  it('treats unknown errors as permanent so bugs are not retried', () => {
    expect(classifyFailure(new Error('boom'))).toBe('permanent');
  });
});

describe('serverRetryDelayMs', () => {
  it('reads the RetryInfo delay of a 429', () => {
    const error = apiError(
      429,
      '{"error":{"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"16s"}]}}',
    );
    expect(serverRetryDelayMs(error)).toBe(16_000);
  });

  it('ignores other statuses and messages without a delay', () => {
    expect(
      serverRetryDelayMs(apiError(503, '"retryDelay":"5s"')),
    ).toBeUndefined();
    expect(serverRetryDelayMs(apiError(429, 'quota exceeded'))).toBeUndefined();
  });
});

describe('decideRetry', () => {
  it('never retries permanent failures', () => {
    expect(decideRetry(apiError(400), 1, policy)).toEqual({
      retry: false,
      reason: 'permanent',
    });
  });

  it('backs off exponentially with jitter', () => {
    const noJitter = () => 0;
    const fullJitter = () => 1;
    expect(decideRetry(apiError(503), 1, policy, noJitter)).toEqual({
      retry: true,
      delayMs: 1_000,
    });
    expect(decideRetry(apiError(503), 2, policy, noJitter)).toEqual({
      retry: true,
      delayMs: 2_000,
    });
    expect(decideRetry(apiError(503), 2, policy, fullJitter)).toEqual({
      retry: true,
      delayMs: 3_000,
    });
  });

  it('stops after the last attempt and reports the server delay', () => {
    const error = apiError(429, '"retryDelay":"4s"');
    expect(decideRetry(error, 3, policy)).toEqual({
      retry: false,
      reason: 'attempts-exhausted',
      retryAfterMs: 4_000,
    });
  });

  it('honours a short server delay and gives up on a long one', () => {
    expect(decideRetry(apiError(429, '"retryDelay":"4s"'), 1, policy)).toEqual({
      retry: true,
      delayMs: 4_000,
    });
    expect(decideRetry(apiError(429, '"retryDelay":"45s"'), 1, policy)).toEqual(
      {
        retry: false,
        reason: 'delay-too-long',
        retryAfterMs: 45_000,
      },
    );
  });
});
