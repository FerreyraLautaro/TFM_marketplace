import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LLM_PROVIDER, StructuredGenerationResult } from '../llm/llm-provider';
import { LlmRequestError, LlmUnavailableError } from '../llm/llm.errors';
import { Brand } from './brand.entity';
import { CatalogNormalizerService } from './catalog-normalizer.service';
import { InvalidLlmOutputError } from './catalog.errors';
import { NormalizationRunStatus } from './normalization-run-status.enum';
import { NormalizationRun } from './normalization-run.entity';

describe('CatalogNormalizerService', () => {
  let service: CatalogNormalizerService;
  const llm = { generateStructured: jest.fn() };
  const brandRepository = { find: jest.fn() };
  const runRepository = {
    create: jest.fn((data: Partial<NormalizationRun>) => data),
    save: jest.fn((run: Partial<NormalizationRun>) =>
      Promise.resolve({ ...run, id: 'run-1' }),
    ),
  };

  const brands: Brand[] = [
    { id: 'brand-1', name: 'La Serenísima', aliases: ['Seren'] },
  ];

  const generation = (rawText: string): StructuredGenerationResult => ({
    rawText,
    model: 'test-model',
    attempts: 2,
    latencyMs: 40,
    usage: { inputTokens: 120, outputTokens: 30 },
  });

  const validOutput = JSON.stringify({
    brand: 'SERENISIMA',
    productName: 'Leche entera',
    quantity: 1,
    unit: 'l',
    category: 'LACTEOS',
    confidence: 'high',
  });

  const savedRun = (): Partial<NormalizationRun> =>
    runRepository.save.mock.calls[0][0];

  beforeEach(async () => {
    jest.clearAllMocks();
    brandRepository.find.mockResolvedValue(brands);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogNormalizerService,
        { provide: LLM_PROVIDER, useValue: llm },
        { provide: getRepositoryToken(Brand), useValue: brandRepository },
        {
          provide: getRepositoryToken(NormalizationRun),
          useValue: runRepository,
        },
      ],
    }).compile();
    service = moduleRef.get(CatalogNormalizerService);
  });

  it('sends the v1 prompt with the provider JSON schema', async () => {
    llm.generateStructured.mockResolvedValue(generation(validOutput));

    await service.normalize('user-1', 'LECHE SERENISIMA ENTERA 1LT');

    expect(llm.generateStructured).toHaveBeenCalledWith({
      systemInstruction: expect.stringContaining('LACTEOS') as unknown,
      prompt: expect.stringContaining('LECHE SERENISIMA ENTERA 1LT') as unknown,
      jsonSchema: expect.objectContaining({ type: 'object' }) as unknown,
    });
  });

  it('converts units, matches the brand and records a SUCCESS run', async () => {
    llm.generateStructured.mockResolvedValue(generation(validOutput));

    const response = await service.normalize(
      'user-1',
      'LECHE SERENISIMA ENTERA 1LT',
    );

    const proposal = {
      brand: 'La Serenísima',
      brandStatus: 'MATCHED',
      brandId: 'brand-1',
      matchedBy: 'name',
      extractedBrand: 'SERENISIMA',
      productName: 'Leche entera',
      quantity: 1000,
      unit: 'ml',
      category: 'LACTEOS',
      confidence: 'high',
    };
    expect(response).toMatchObject({
      runId: 'run-1',
      promptVersion: 'v2',
      model: 'test-model',
      proposal,
      meta: { attempts: 2 },
    });
    expect(savedRun()).toMatchObject({
      userId: 'user-1',
      rawText: 'LECHE SERENISIMA ENTERA 1LT',
      promptVersion: 'v2',
      model: 'test-model',
      status: NormalizationRunStatus.SUCCESS,
      rawOutput: validOutput,
      result: proposal,
      attempts: 2,
      inputTokens: 120,
      outputTokens: 30,
    });
  });

  it('records INVALID_OUTPUT when the output is not JSON', async () => {
    llm.generateStructured.mockResolvedValue(generation('Sure! Here it is'));

    const call = service.normalize('user-1', 'LECHE');

    await expect(call).rejects.toBeInstanceOf(InvalidLlmOutputError);
    await expect(call).rejects.toMatchObject({ runId: 'run-1' });
    expect(savedRun()).toMatchObject({
      status: NormalizationRunStatus.INVALID_OUTPUT,
      rawOutput: 'Sure! Here it is',
      error: expect.stringContaining('not valid JSON') as unknown,
    });
    expect(brandRepository.find).not.toHaveBeenCalled();
  });

  it('records INVALID_OUTPUT when the output breaks the schema', async () => {
    const outOfList = JSON.stringify({
      ...(JSON.parse(validOutput) as object),
      category: 'QUESOS',
    });
    llm.generateStructured.mockResolvedValue(generation(outOfList));

    await expect(service.normalize('user-1', 'QUESO')).rejects.toBeInstanceOf(
      InvalidLlmOutputError,
    );
    expect(savedRun()).toMatchObject({
      status: NormalizationRunStatus.INVALID_OUTPUT,
      rawOutput: outOfList,
      error: expect.stringContaining('category') as unknown,
    });
    expect(savedRun()).not.toHaveProperty('result');
  });

  it('records an ERROR run and rethrows when the provider is unavailable', async () => {
    const error = new LlmUnavailableError('LLM unavailable', 3, 20_000, {
      cause: new Error('overloaded'),
    });
    llm.generateStructured.mockRejectedValue(error);

    await expect(service.normalize('user-1', 'LECHE')).rejects.toBe(error);
    expect(savedRun()).toMatchObject({
      status: NormalizationRunStatus.ERROR,
      attempts: 3,
      error: 'LlmUnavailableError: LLM unavailable (cause: overloaded)',
    });
    expect(savedRun().model).toBeUndefined();
  });

  it('records an ERROR run and rethrows when the provider rejects the request', async () => {
    const error = new LlmRequestError('LLM request rejected', 1);
    llm.generateStructured.mockRejectedValue(error);

    await expect(service.normalize('user-1', 'LECHE')).rejects.toBe(error);
    expect(savedRun()).toMatchObject({
      status: NormalizationRunStatus.ERROR,
      attempts: 1,
      error: 'LlmRequestError: LLM request rejected',
    });
  });
});
