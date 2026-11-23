/** The model answered, but its output was not valid JSON or did not follow the schema. */
export class InvalidLlmOutputError extends Error {
  constructor(
    readonly runId: string,
    readonly reason: string,
  ) {
    super(`Invalid LLM output: ${reason}`);
    this.name = 'InvalidLlmOutputError';
  }
}
