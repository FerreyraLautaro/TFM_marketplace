import { ApiError } from '@google/genai';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { LlmRequestError, LlmUnavailableError } from './llm.errors';
import { RateLimiter } from './rate-limiter';

describe('GeminiLlmProvider', () => {
  const request = {
    systemInstruction: 'Extract product data',
    prompt: 'LECHE SERENISIMA ENTERA 1LT',
    jsonSchema: { type: 'object' },
  };
  const generateContent = jest.fn();
  const sleeps: number[] = [];

  function createProvider(): GeminiLlmProvider {
    return new GeminiLlmProvider(
      { generateContent },
      {
        model: 'test-model',
        retry: { maxAttempts: 3, baseDelayMs: 1_000, maxDelayMs: 10_000 },
        // A generous quota so these tests only exercise the retry policy.
        rateLimiter: new RateLimiter(60_000, 60_000),
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      },
    );
  }

  const okResponse = {
    text: '{"brand":"La Serenísima"}',
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
  };

  beforeEach(() => {
    generateContent.mockReset();
    sleeps.length = 0;
  });

  it('asks for JSON following the schema and returns the raw text with usage', async () => {
    generateContent.mockResolvedValue(okResponse);

    const result = await createProvider().generateStructured(request);

    expect(generateContent).toHaveBeenCalledWith({
      model: 'test-model',
      contents: request.prompt,
      config: expect.objectContaining({
        systemInstruction: request.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: request.jsonSchema,
        temperature: 0,
      }) as unknown,
    });
    expect(result).toMatchObject({
      rawText: okResponse.text,
      model: 'test-model',
      attempts: 1,
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it('retries transient failures and reports the number of attempts', async () => {
    generateContent
      .mockRejectedValueOnce(
        new ApiError({ status: 503, message: 'overloaded' }),
      )
      .mockRejectedValueOnce(new ApiError({ status: 429, message: 'quota' }))
      .mockResolvedValue(okResponse);

    const result = await createProvider().generateStructured(request);

    expect(result.attempts).toBe(3);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
  });

  it('gives up after the last attempt with LlmUnavailableError', async () => {
    generateContent.mockRejectedValue(
      new ApiError({ status: 503, message: 'overloaded' }),
    );

    const call = createProvider().generateStructured(request);

    await expect(call).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(call).rejects.toMatchObject({ attempts: 3 });
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it('does not retry permanent failures', async () => {
    generateContent.mockRejectedValue(
      new ApiError({ status: 400, message: 'invalid argument' }),
    );

    const call = createProvider().generateStructured(request);

    await expect(call).rejects.toBeInstanceOf(LlmRequestError);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('returns an empty text instead of failing when the model sends nothing', async () => {
    generateContent.mockResolvedValue({ text: undefined });

    const result = await createProvider().generateStructured(request);

    expect(result.rawText).toBe('');
    expect(result.usage).toEqual({ inputTokens: null, outputTokens: null });
  });
});
