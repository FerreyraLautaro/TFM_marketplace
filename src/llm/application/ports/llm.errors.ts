/** The provider could not answer in time: quota, outage, timeout or local backpressure. Worth retrying later. */
export class LlmUnavailableError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    readonly retryAfterMs?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmUnavailableError';
  }
}

/** The request itself is wrong (bad input, invalid key, forbidden). Retrying will not help. */
export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly attempts: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmRequestError';
  }
}
