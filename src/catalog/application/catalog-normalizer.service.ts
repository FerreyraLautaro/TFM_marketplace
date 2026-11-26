import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { z } from 'zod';
import { Repository } from 'typeorm';
import {
  LLM_PROVIDER,
  LlmProvider,
  StructuredGenerationResult,
} from '../../llm/application/ports/llm-provider';
import { Brand } from '../domain/brand.entity';
import { matchBrand } from '../domain/brand-matching';
import { InvalidLlmOutputError } from '../domain/catalog.errors';
import {
  LlmOutput,
  llmOutputSchema,
  toProviderJsonSchema,
} from '../domain/llm-output.schema';
import { NormalizationProposal } from '../domain/normalization-proposal';
import { NormalizationRunStatus } from '../domain/normalization-run-status.enum';
import { NormalizationRun } from '../domain/normalization-run.entity';
import { CURRENT_PROMPT_VERSION, PromptVersion, getPrompt } from './prompts';
import { toCanonicalQuantity } from '../domain/units';

export interface NormalizationResponse {
  runId: string;
  promptVersion: PromptVersion;
  model: string;
  proposal: NormalizationProposal;
  meta: { attempts: number; latencyMs: number };
}

type ParseResult =
  { ok: true; output: LlmOutput } | { ok: false; reason: string };

@Injectable()
export class CatalogNormalizerService {
  private readonly logger = new Logger(CatalogNormalizerService.name);
  private readonly jsonSchema = toProviderJsonSchema(llmOutputSchema);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(NormalizationRun)
    private readonly runs: Repository<NormalizationRun>,
  ) {}

  /**
   * Proposes a normalized product for a raw line. The model interprets the text;
   * unit conversion and brand matching are done here, deterministically. Every
   * call is recorded, including failures, before returning or throwing.
   */
  async normalize(
    userId: string | null,
    rawText: string,
    promptVersion: PromptVersion = CURRENT_PROMPT_VERSION,
  ): Promise<NormalizationResponse> {
    const prompt = getPrompt(promptVersion);
    const base = { userId, rawText, promptVersion };
    const startedAt = Date.now();

    let generation: StructuredGenerationResult;
    try {
      generation = await this.llm.generateStructured({
        systemInstruction: prompt.systemInstruction,
        prompt: prompt.buildPrompt(rawText),
        jsonSchema: this.jsonSchema,
      });
    } catch (error) {
      await this.record({
        ...base,
        status: NormalizationRunStatus.ERROR,
        error: describeError(error),
        attempts: attemptsOf(error),
        latencyMs: Date.now() - startedAt,
      });
      throw error;
    }

    const outcome = {
      model: generation.model,
      rawOutput: generation.rawText,
      attempts: generation.attempts,
      latencyMs: Date.now() - startedAt,
      inputTokens: generation.usage.inputTokens,
      outputTokens: generation.usage.outputTokens,
    };

    const parsed = parseOutput(generation.rawText);
    if (!parsed.ok) {
      const run = await this.record({
        ...base,
        ...outcome,
        status: NormalizationRunStatus.INVALID_OUTPUT,
        error: parsed.reason,
      });
      this.logger.warn(`Run ${run.id} got invalid output: ${parsed.reason}`);
      throw new InvalidLlmOutputError(run.id, parsed.reason);
    }

    const proposal = buildProposal(parsed.output, await this.brands.find());
    const run = await this.record({
      ...base,
      ...outcome,
      status: NormalizationRunStatus.SUCCESS,
      result: proposal,
    });

    return {
      runId: run.id,
      promptVersion,
      model: generation.model,
      proposal,
      meta: { attempts: outcome.attempts, latencyMs: outcome.latencyMs },
    };
  }

  private record(
    data: Partial<NormalizationRun> &
      Pick<NormalizationRun, 'status' | 'attempts' | 'latencyMs'>,
  ): Promise<NormalizationRun> {
    return this.runs.save(this.runs.create(data));
  }
}

function parseOutput(rawText: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Output is not valid JSON: ${detail}` };
  }
  const result = llmOutputSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      reason: `Output does not match the schema:\n${z.prettifyError(result.error)}`,
    };
  }
  return { ok: true, output: result.data };
}

function buildProposal(
  output: LlmOutput,
  brands: Brand[],
): NormalizationProposal {
  return {
    ...matchBrand(output.brand, brands),
    extractedBrand: output.brand,
    productName: output.productName,
    ...toCanonicalQuantity(output.quantity, output.unit),
    category: output.category,
    confidence: output.confidence,
  };
}

function attemptsOf(error: unknown): number {
  if (error !== null && typeof error === 'object' && 'attempts' in error) {
    return typeof error.attempts === 'number' ? error.attempts : 0;
  }
  return 0;
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause =
    error.cause instanceof Error ? ` (cause: ${error.cause.message})` : '';
  return `${error.name}: ${error.message}${cause}`;
}
