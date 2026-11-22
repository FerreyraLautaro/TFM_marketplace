import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { NormalizationRun } from '../src/catalog/normalization-run.entity';
import { LLM_PROVIDER, LlmProvider } from '../src/llm/llm-provider';
import { LlmUnavailableError } from '../src/llm/llm.errors';
import { UserRole } from '../src/users/user-role.enum';
import { Actor, registerActor } from './utils/actors';
import { createE2eApp, resetDatabase } from './utils/e2e-app';

const generation = (rawText: string) => ({
  rawText,
  model: 'fake-model',
  attempts: 1,
  latencyMs: 5,
  usage: { inputTokens: 100, outputTokens: 20 },
});

describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let seller: Actor;
  let buyer: Actor;
  // No real Gemini calls in tests: each case decides what the model answers.
  const fakeLlm = {
    generateStructured: jest.fn<
      ReturnType<LlmProvider['generateStructured']>,
      Parameters<LlmProvider['generateStructured']>
    >(),
  };

  const normalize = (actor: Actor | null, rawText: string) => {
    const req = request(app.getHttpServer()).post('/catalog/normalize');
    if (actor) {
      void req.auth(actor.token, { type: 'bearer' });
    }
    return req.send({ rawText });
  };

  const findRun = (id: string) =>
    app.get(DataSource).getRepository(NormalizationRun).findOneByOrFail({ id });

  beforeAll(async () => {
    app = await createE2eApp([{ token: LLM_PROVIDER, useValue: fakeLlm }]);
  });

  beforeEach(async () => {
    fakeLlm.generateStructured.mockReset();
    await resetDatabase(app);
    seller = await registerActor(app, 'seller@example.com', UserRole.SELLER);
    buyer = await registerActor(app, 'buyer@example.com', UserRole.BUYER);
  });

  afterAll(async () => {
    await app.close();
  });

  it('proposes a normalized product with a seeded brand and converted units', async () => {
    fakeLlm.generateStructured.mockResolvedValue(
      generation(
        JSON.stringify({
          brand: 'SERENISIMA',
          productName: 'Leche entera',
          quantity: 1,
          unit: 'l',
          category: 'LACTEOS',
          confidence: 'high',
        }),
      ),
    );

    const res = await normalize(seller, 'LECHE SERENISIMA ENTERA 1LT').expect(
      200,
    );

    const body = res.body as { runId: string; proposal: unknown };
    expect(body).toMatchObject({
      promptVersion: 'v1',
      model: 'fake-model',
      meta: { attempts: 1 },
      proposal: {
        brand: 'La Serenísima',
        brandStatus: 'MATCHED',
        matchedBy: 'name',
        productName: 'Leche entera',
        quantity: 1000,
        unit: 'ml',
        category: 'LACTEOS',
        confidence: 'high',
      },
    });
    const run = await findRun(body.runId);
    expect(run).toMatchObject({
      userId: seller.id,
      status: 'SUCCESS',
      result: body.proposal,
    });
  });

  it('forbids buyers', async () => {
    await normalize(buyer, 'LECHE').expect(403);
    expect(fakeLlm.generateStructured).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await normalize(null, 'LECHE').expect(401);
  });

  it('rejects an empty or too long raw text', async () => {
    await normalize(seller, '').expect(400);
    await normalize(seller, 'x'.repeat(201)).expect(400);
  });

  it('answers 502 with the run id and stores the invalid output', async () => {
    fakeLlm.generateStructured.mockResolvedValue(generation('not json at all'));

    const res = await normalize(seller, 'LECHE').expect(502);

    const { runId } = res.body as { runId: string };
    const run = await findRun(runId);
    expect(run).toMatchObject({
      status: 'INVALID_OUTPUT',
      rawOutput: 'not json at all',
      result: null,
    });
    expect(run.error).toContain('not valid JSON');
  });

  it('answers 503 with Retry-After and records the failure when the model is unavailable', async () => {
    fakeLlm.generateStructured.mockRejectedValue(
      new LlmUnavailableError('LLM unavailable', 3, 12_000),
    );

    const res = await normalize(seller, 'LECHE').expect(503);

    expect(res.headers['retry-after']).toBe('12');
    const runs = await app
      .get(DataSource)
      .getRepository(NormalizationRun)
      .findBy({ userId: seller.id });
    expect(runs).toEqual([
      expect.objectContaining({ status: 'ERROR', attempts: 3, model: null }),
    ]);
  });
});
