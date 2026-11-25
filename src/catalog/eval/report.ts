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

type Metric = (score: RunScore) => number;

const FIELDS: ScoredField[] = [...OBJECTIVE_FIELDS, 'productName'];

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

const fieldLabel = (field: ScoredField) =>
  field === 'productName' ? 'productName (subjetivo)' : field;

/** Share of calls the provider answered: availability, not prompt quality. */
export const availability: Metric = (score) =>
  score.total === 0 ? 0 : score.statuses.SUCCESS / score.total;

/**
 * Rescales an accuracy measured over every item to the calls that answered.
 * Failed calls count as wrong in the overall accuracy, so this separates the
 * prompt's quality from provider outages, and works on already stored results.
 */
export function onSuccess(score: RunScore, overall: number): number {
  const answered = score.statuses.SUCCESS;
  return answered === 0 ? 0 : (overall * score.total) / answered;
}

const inputTokensPerCall: Metric = (score) =>
  score.statuses.SUCCESS === 0
    ? 0
    : score.tokens.input / score.statuses.SUCCESS;

const qualityMetrics: Array<[string, Metric]> = [
  ...FIELDS.map((field): [string, Metric] => [
    fieldLabel(field),
    (score) => onSuccess(score, score.fieldAccuracy[field]),
  ]),
  [
    '**Todos los campos objetivos**',
    (score) => onSuccess(score, score.fullMatch),
  ],
];

const overallMetrics: Array<[string, Metric]> = [
  ...FIELDS.map((field): [string, Metric] => [
    fieldLabel(field),
    (score) => score.fieldAccuracy[field],
  ]),
  ['**Todos los campos objetivos**', (score) => score.fullMatch],
];

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
  const metricTable = (metrics: Array<[string, Metric]>) => {
    const table = [
      `| Campo | ${runHeaders.join(' | ')} | Promedio | Variación entre corridas |`,
      `|---|${runs.map(() => '---|').join('')}---|---|`,
    ];
    for (const [label, metric] of metrics) {
      const values = runs.map((run) => metric(run.score));
      table.push(
        `| ${label} | ${values.map(percent).join(' | ')} | ${percent(mean(values))} | ${percent(spread(values))} |`,
      );
    }
    return table;
  };

  lines.push(
    '',
    '## Calidad (solo llamadas que respondieron)',
    '',
    '> Mide el prompt y el modelo sin mezclar caídas del proveedor.',
    '',
    ...metricTable(qualityMetrics),
    '',
    '## Disponibilidad, costo y latencia',
    '',
    `| Métrica | ${runHeaders.join(' | ')} |`,
    `|---|${runs.map(() => '---|').join('')}`,
    `| Disponibilidad (respondieron / total) | ${runs.map(({ score: s }) => `${percent(availability(s))} (${s.statuses.SUCCESS}/${s.total})`).join(' | ')} |`,
    `| SUCCESS / INVALID_OUTPUT / ERROR | ${runs.map(({ score: s }) => `${s.statuses.SUCCESS} / ${s.statuses.INVALID_OUTPUT} / ${s.statuses.ERROR}`).join(' | ')} |`,
    `| Reintentos | ${runs.map((run) => run.score.retries).join(' | ')} |`,
    `| Tokens de entrada por llamada | ${runs.map((run) => Math.round(inputTokensPerCall(run.score))).join(' | ')} |`,
    `| Tokens entrada / salida (total) | ${runs.map(({ score: s }) => `${s.tokens.input} / ${s.tokens.output}`).join(' | ')} |`,
    `| Latencia p50 / p95 (ms) | ${runs.map(({ score: s }) => `${s.latencyMs.p50 ?? '-'} / ${s.latencyMs.p95 ?? '-'}`).join(' | ')} |`,
    '',
    '> La latencia incluye la espera del limitador de ritmo (15 RPM ≈ 4 s entre llamadas).',
    '',
    '## Precisión sobre el total (las llamadas fallidas cuentan como error)',
    '',
    ...metricTable(overallMetrics),
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
  const avg = (result: EvaluationResult, metric: Metric) =>
    mean(result.runs.map((run) => metric(run.score)));
  const noise = (result: EvaluationResult, metric: Metric) =>
    spread(result.runs.map((run) => metric(run.score)));
  const a = baseline.promptVersion;
  const b = candidate.promptVersion;

  const comparisonTable = (metrics: Array<[string, Metric]>) => {
    const table = [
      `| Campo | ${a} | ${b} | Diferencia | Ruido (máx. variación entre corridas) |`,
      '|---|---|---|---|---|',
    ];
    for (const [label, metric] of metrics) {
      const before = avg(baseline, metric);
      const after = avg(candidate, metric);
      const diff = after - before;
      const sign = diff > 0 ? '+' : '';
      table.push(
        `| ${label} | ${percent(before)} | ${percent(after)} | ${sign}${(diff * 100).toFixed(1)} pp | ${percent(Math.max(noise(baseline, metric), noise(candidate, metric)))} |`,
      );
    }
    return table;
  };

  return [
    `# Comparación ${a} vs ${b}`,
    '',
    `- ${a}: ${baseline.runs.length} corrida(s), ${baseline.startedAt}${baseline.partial ? ' (parcial)' : ''}`,
    `- ${b}: ${candidate.runs.length} corrida(s), ${candidate.startedAt}${candidate.partial ? ' (parcial)' : ''}`,
    `- Modelo: \`${baseline.model}\`${baseline.model === candidate.model ? '' : ` vs \`${candidate.model}\``}`,
    '',
    '## Calidad (solo llamadas que respondieron)',
    '',
    ...comparisonTable(qualityMetrics),
    '',
    '> Una diferencia menor o igual al ruido no es evidencia de mejora: puede ser variación propia del modelo.',
    '',
    '## Disponibilidad y costo',
    '',
    `| Métrica | ${a} | ${b} |`,
    '|---|---|---|',
    `| Disponibilidad (llamadas que respondieron) | ${percent(avg(baseline, availability))} | ${percent(avg(candidate, availability))} |`,
    `| Tokens de entrada por llamada | ${Math.round(avg(baseline, inputTokensPerCall))} | ${Math.round(avg(candidate, inputTokensPerCall))} |`,
    '',
    '> La disponibilidad depende del proveedor en el momento de la corrida, no del prompt.',
    '',
    '## Precisión sobre el total (las llamadas fallidas cuentan como error)',
    '',
    ...comparisonTable(overallMetrics),
    '',
  ].join('\n');
}

function format(value: unknown): string {
  if (value === null || value === undefined) {
    return '`null`';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return `\`${text}\``;
}
