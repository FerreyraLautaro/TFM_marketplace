import { OBJECTIVE_FIELDS, RunScore, ScoredField } from './scoring';

export interface EvaluationRun {
  run: number;
  /** False when the evaluation stopped mid-run; its score covers only the evaluated items. */
  completed: boolean;
  score: RunScore;
}

export interface EvaluationResult {
  promptVersion: string;
  model: string;
  startedAt: string;
  datasetSize: number;
  runsRequested: number;
  partial: boolean;
  abortReason?: string;
  runs: EvaluationRun[];
}

const FIELDS: ScoredField[] = [...OBJECTIVE_FIELDS, 'productName'];

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

/** Spread between the best and worst run: how much the model varies with itself. */
function spread(values: number[]): number {
  return values.length < 2 ? 0 : Math.max(...values) - Math.min(...values);
}

function mean(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function renderRunReport(result: EvaluationResult): string {
  const { runs } = result;
  const lines = [
    `# Evaluación del normalizador · prompt ${result.promptVersion}`,
    '',
    `- Modelo: \`${result.model}\``,
    `- Fecha: ${result.startedAt}`,
    `- Dataset: ${result.datasetSize} productos · corridas: ${runs.length} de ${result.runsRequested}`,
  ];
  if (result.partial) {
    lines.push(
      `- **Resultado parcial:** ${result.abortReason ?? 'evaluación interrumpida'}`,
    );
  }
  if (runs.length === 0) {
    return [...lines, '', 'No se completó ninguna corrida.', ''].join('\n');
  }

  const runHeaders = runs.map((run) =>
    run.completed
      ? `Corrida ${run.run}`
      : `Corrida ${run.run} (parcial: ${run.score.total}/${result.datasetSize})`,
  );
  lines.push(
    '',
    '## Precisión por campo',
    '',
    `| Campo | ${runHeaders.join(' | ')} | Promedio | Variación entre corridas |`,
    `|---|${runs.map(() => '---|').join('')}---|---|`,
  );
  for (const field of FIELDS) {
    const values = runs.map((run) => run.score.fieldAccuracy[field]);
    const label = field === 'productName' ? 'productName (subjetivo)' : field;
    lines.push(
      `| ${label} | ${values.map(percent).join(' | ')} | ${percent(mean(values))} | ${percent(spread(values))} |`,
    );
  }
  const full = runs.map((run) => run.score.fullMatch);
  lines.push(
    `| **Todos los campos objetivos** | ${full.map(percent).join(' | ')} | ${percent(mean(full))} | ${percent(spread(full))} |`,
    '',
    '## Validez, costo y latencia',
    '',
    `| Métrica | ${runHeaders.join(' | ')} |`,
    `|---|${runs.map(() => '---|').join('')}`,
    `| SUCCESS / INVALID_OUTPUT / ERROR | ${runs.map(({ score: s }) => `${s.statuses.SUCCESS} / ${s.statuses.INVALID_OUTPUT} / ${s.statuses.ERROR}`).join(' | ')} |`,
    `| Reintentos | ${runs.map((run) => run.score.retries).join(' | ')} |`,
    `| Tokens entrada / salida | ${runs.map(({ score: s }) => `${s.tokens.input} / ${s.tokens.output}`).join(' | ')} |`,
    `| Latencia p50 / p95 (ms) | ${runs.map(({ score: s }) => `${s.latencyMs.p50 ?? '-'} / ${s.latencyMs.p95 ?? '-'}`).join(' | ')} |`,
    '',
    '> La latencia incluye la espera del limitador de ritmo (15 RPM ≈ 4 s entre llamadas).',
    '',
    '## Errores de la corrida 1',
    '',
    '| # | Texto | Campo | Esperado | Obtenido |',
    '|---|---|---|---|---|',
  );
  for (const mismatch of runs[0].score.mismatches) {
    lines.push(
      `| ${mismatch.id} | \`${mismatch.rawText}\` | ${mismatch.field} | ${format(mismatch.expected)} | ${format(mismatch.actual)} |`,
    );
  }
  return [...lines, ''].join('\n');
}

export function renderComparison(
  baseline: EvaluationResult,
  candidate: EvaluationResult,
): string {
  const avg = (result: EvaluationResult, pick: (score: RunScore) => number) =>
    mean(result.runs.map((run) => pick(run.score)));
  const noise = (result: EvaluationResult, pick: (score: RunScore) => number) =>
    spread(result.runs.map((run) => pick(run.score)));

  const rows: Array<[string, (score: RunScore) => number]> = [
    ...FIELDS.map(
      (field) =>
        [
          field === 'productName' ? 'productName (subjetivo)' : field,
          (score: RunScore) => score.fieldAccuracy[field],
        ] as [string, (score: RunScore) => number],
    ),
    ['**Todos los campos objetivos**', (score) => score.fullMatch],
  ];

  const lines = [
    `# Comparación ${baseline.promptVersion} vs ${candidate.promptVersion}`,
    '',
    `- ${baseline.promptVersion}: ${baseline.runs.length} corrida(s), ${baseline.startedAt}${baseline.partial ? ' (parcial)' : ''}`,
    `- ${candidate.promptVersion}: ${candidate.runs.length} corrida(s), ${candidate.startedAt}${candidate.partial ? ' (parcial)' : ''}`,
    '',
    `| Campo | ${baseline.promptVersion} | ${candidate.promptVersion} | Diferencia | Ruido (máx. variación entre corridas) |`,
    '|---|---|---|---|---|',
  ];
  for (const [label, pick] of rows) {
    const before = avg(baseline, pick);
    const after = avg(candidate, pick);
    const diff = after - before;
    const sign = diff > 0 ? '+' : '';
    lines.push(
      `| ${label} | ${percent(before)} | ${percent(after)} | ${sign}${(diff * 100).toFixed(1)} pp | ${percent(Math.max(noise(baseline, pick), noise(candidate, pick)))} |`,
    );
  }
  lines.push(
    '',
    '> Una diferencia menor o igual al ruido no es evidencia de mejora: puede ser variación propia del modelo.',
    '',
  );
  return lines.join('\n');
}

function format(value: unknown): string {
  if (value === null || value === undefined) {
    return '`null`';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `\`${text}\``;
}
