import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { CatalogModule } from '../src/catalog/catalog.module';
import { CatalogNormalizerService } from '../src/catalog/catalog-normalizer.service';
import { InvalidLlmOutputError } from '../src/catalog/catalog.errors';
import { EvaluationResult, renderRunReport } from '../src/catalog/eval/report';
import { GoldenItem, ItemOutcome, scoreRun } from '../src/catalog/eval/scoring';
import { NormalizationRun } from '../src/catalog/normalization-run.entity';
import {
  CURRENT_PROMPT_VERSION,
  PROMPT_VERSIONS,
  PromptVersion,
} from '../src/catalog/prompts';
import { ConfigurationModule } from '../src/config/configuration.module';
import { DatabaseModule } from '../src/database/database.module';
import { LlmUnavailableError } from '../src/llm/llm.errors';

// Stop instead of burning quota once the provider is clearly refusing:
// a wait longer than a minute usually means the daily quota is exhausted.
const QUOTA_WAIT_THRESHOLD_MS = 60_000;
const MAX_CONSECUTIVE_ERRORS = 3;

@Module({ imports: [ConfigurationModule, DatabaseModule, CatalogModule] })
class EvaluationModule {}

/** The provider keeps refusing: stop spending calls and keep what was measured. */
class ProviderRefusingError extends Error {}

/** Overload and quota look alike (repeated failures) but need different actions. */
function describeRefusal(errors: string[]): string {
  const text = errors.join(' ');
  if (/\b429\b|RESOURCE_EXHAUSTED/.test(text)) {
    return 'cuota agotada (429): esperar a que se renueve o volver a correr con --runs 1';
  }
  if (/\b50[34]\b|UNAVAILABLE|DEADLINE_EXCEEDED/.test(text)) {
    return 'el modelo está saturado del lado del proveedor (503/504): reintentar en unos minutos';
  }
  return 'errores repetidos del proveedor';
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
  return `${error.message}${cause}`;
}

function parseArgs(argv: string[]): { prompt: PromptVersion; runs: number } {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const prompt = (value('--prompt') ?? CURRENT_PROMPT_VERSION) as PromptVersion;
  if (!PROMPT_VERSIONS.includes(prompt)) {
    throw new Error(
      `Unknown prompt "${prompt}". Available: ${PROMPT_VERSIONS.join(', ')}`,
    );
  }
  const runs = Number(value('--runs') ?? 2);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error('--runs must be a positive integer');
  }
  return { prompt, runs };
}

async function main(): Promise<void> {
  const { prompt, runs } = parseArgs(process.argv.slice(2));
  const logger = new Logger('Evaluation');
  const dataset = JSON.parse(
    readFileSync(join(__dirname, 'golden-dataset.json'), 'utf8'),
  ) as { items: GoldenItem[] };

  const app = await NestFactory.createApplicationContext(EvaluationModule, {
    logger: ['warn', 'error'],
  });
  const normalizer = app.get(CatalogNormalizerService);
  const runRepository = app.get(DataSource).getRepository(NormalizationRun);

  const startedAt = new Date().toISOString();
  const result: EvaluationResult = {
    promptVersion: prompt,
    model: process.env.GEMINI_MODEL ?? 'unknown',
    startedAt,
    datasetSize: dataset.items.length,
    runsRequested: runs,
    partial: false,
    runs: [],
  };

  try {
    for (let run = 1; run <= runs && !result.partial; run++) {
      const outcomes: ItemOutcome[] = [];
      try {
        for (const [index, item] of dataset.items.entries()) {
          const outcome = await evaluateItem(item);
          outcomes.push(outcome);
          logger.log(
            `[corrida ${run}/${runs}] ${index + 1}/${dataset.items.length} #${item.id} ${outcome.status}`,
          );
          const recent = outcomes.slice(-MAX_CONSECUTIVE_ERRORS);
          if (
            recent.length === MAX_CONSECUTIVE_ERRORS &&
            recent.every((entry) => entry.status === 'ERROR')
          ) {
            throw new ProviderRefusingError(
              describeRefusal(recent.map((entry) => entry.error ?? '')),
            );
          }
        }
      } catch (error) {
        if (!(error instanceof ProviderRefusingError)) {
          throw error;
        }
        result.partial = true;
        result.abortReason = `corrida ${run}, producto ${outcomes.length} de ${dataset.items.length}: ${error.message}`;
        logger.warn(`Evaluación interrumpida en la ${result.abortReason}`);
      }
      // A partial run is kept: what was measured before stopping is still evidence.
      if (outcomes.length > 0) {
        result.runs.push({
          run,
          completed: outcomes.length === dataset.items.length,
          score: scoreRun(outcomes),
        });
      }
    }
  } finally {
    await app.close();
  }

  const stamp = startedAt.replace(/[:.]/g, '-');
  const name = `${stamp}-${prompt}`;
  mkdirSync(join(__dirname, 'results'), { recursive: true });
  mkdirSync(join(__dirname, 'reports'), { recursive: true });
  writeFileSync(
    join(__dirname, 'results', `${name}.json`),
    JSON.stringify(result, null, 2),
  );
  writeFileSync(
    join(__dirname, 'reports', `${name}.md`),
    renderRunReport(result),
  );
  logger.log(
    `Resultados: eval/results/${name}.json · reporte: eval/reports/${name}.md`,
  );

  async function evaluateItem(item: GoldenItem): Promise<ItemOutcome> {
    const base = {
      id: item.id,
      rawText: item.rawText,
      expected: item.expected,
    };
    try {
      const response = await normalizer.normalize(null, item.rawText, prompt);
      const stored = await runRepository.findOneBy({ id: response.runId });
      result.model = response.model;
      return {
        ...base,
        status: 'SUCCESS',
        proposal: response.proposal,
        attempts: response.meta.attempts,
        latencyMs: response.meta.latencyMs,
        inputTokens: stored?.inputTokens ?? null,
        outputTokens: stored?.outputTokens ?? null,
      };
    } catch (error) {
      if (error instanceof InvalidLlmOutputError) {
        const stored = await runRepository.findOneBy({ id: error.runId });
        return {
          ...base,
          status: 'INVALID_OUTPUT',
          error: error.message,
          attempts: stored?.attempts,
          latencyMs: stored?.latencyMs,
          inputTokens: stored?.inputTokens ?? null,
          outputTokens: stored?.outputTokens ?? null,
        };
      }
      if (
        error instanceof LlmUnavailableError &&
        (error.retryAfterMs ?? 0) > QUOTA_WAIT_THRESHOLD_MS
      ) {
        throw new ProviderRefusingError(
          `el proveedor pidió esperar ${Math.round((error.retryAfterMs ?? 0) / 1000)} s (probable cuota diaria agotada)`,
        );
      }
      return { ...base, status: 'ERROR', error: errorText(error) };
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
