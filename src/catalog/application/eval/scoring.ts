import { brandKey } from '../../domain/brand-matching';
import type { NormalizationProposal } from '../../domain/normalization-proposal';

export type ExpectedProposal = Pick<
  NormalizationProposal,
  'brand' | 'brandStatus' | 'productName' | 'quantity' | 'unit' | 'category'
>;

export interface GoldenItem {
  id: number;
  rawText: string;
  expected: ExpectedProposal;
}

export type OutcomeStatus = 'SUCCESS' | 'INVALID_OUTPUT' | 'ERROR';

export interface ItemOutcome {
  id: number;
  rawText: string;
  expected: ExpectedProposal;
  status: OutcomeStatus;
  proposal?: NormalizationProposal;
  error?: string;
  attempts?: number;
  latencyMs?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

/** Fields with one right answer. productName is scored apart because it is subjective. */
export const OBJECTIVE_FIELDS = [
  'brand',
  'brandStatus',
  'quantity',
  'unit',
  'category',
] as const;
export type ScoredField = (typeof OBJECTIVE_FIELDS)[number] | 'productName';

export interface Mismatch {
  id: number;
  rawText: string;
  field: ScoredField | 'status';
  expected: unknown;
  actual: unknown;
}

export interface RunScore {
  total: number;
  statuses: Record<OutcomeStatus, number>;
  fieldAccuracy: Record<ScoredField, number>;
  /** Share of items with every objective field right. */
  fullMatch: number;
  latencyMs: { p50: number | null; p95: number | null };
  tokens: { input: number; output: number };
  retries: number;
  mismatches: Mismatch[];
}

export function textKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFieldCorrect(
  field: ScoredField,
  expected: ExpectedProposal,
  actual: NormalizationProposal,
): boolean {
  switch (field) {
    case 'brand':
      // Unknown brands keep the model's spelling, so compare by key, not by exact text.
      return expected.brand === null || actual.brand === null
        ? expected.brand === actual.brand
        : brandKey(expected.brand) === brandKey(actual.brand);
    case 'productName':
      return textKey(expected.productName) === textKey(actual.productName);
    case 'quantity':
      return expected.quantity === null || actual.quantity === null
        ? expected.quantity === actual.quantity
        : Math.abs(expected.quantity - actual.quantity) < 0.01;
    default:
      return expected[field] === actual[field];
  }
}

export function scoreRun(outcomes: ItemOutcome[]): RunScore {
  const total = outcomes.length;
  const statuses: Record<OutcomeStatus, number> = {
    SUCCESS: 0,
    INVALID_OUTPUT: 0,
    ERROR: 0,
  };
  const correct: Record<ScoredField, number> = {
    brand: 0,
    brandStatus: 0,
    quantity: 0,
    unit: 0,
    category: 0,
    productName: 0,
  };
  const mismatches: Mismatch[] = [];
  let fullMatches = 0;

  for (const outcome of outcomes) {
    statuses[outcome.status]++;
    const { proposal } = outcome;
    // A failed call counts as wrong on every field: it is part of the quality.
    if (outcome.status !== 'SUCCESS' || !proposal) {
      mismatches.push({
        id: outcome.id,
        rawText: outcome.rawText,
        field: 'status',
        expected: 'SUCCESS',
        actual: outcome.status,
      });
      continue;
    }
    let allObjective = true;
    for (const field of [...OBJECTIVE_FIELDS, 'productName'] as const) {
      if (isFieldCorrect(field, outcome.expected, proposal)) {
        correct[field]++;
        continue;
      }
      if (field !== 'productName') {
        allObjective = false;
      }
      mismatches.push({
        id: outcome.id,
        rawText: outcome.rawText,
        field,
        expected: outcome.expected[field],
        actual: proposal[field],
      });
    }
    if (allObjective) {
      fullMatches++;
    }
  }

  const latencies = outcomes
    .map((outcome) => outcome.latencyMs)
    .filter((value): value is number => value !== undefined)
    .sort((a, b) => a - b);

  return {
    total,
    statuses,
    fieldAccuracy: mapValues(correct, (count) => ratio(count, total)),
    fullMatch: ratio(fullMatches, total),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    tokens: {
      input: sum(outcomes.map((outcome) => outcome.inputTokens ?? 0)),
      output: sum(outcomes.map((outcome) => outcome.outputTokens ?? 0)),
    },
    retries: sum(
      outcomes.map((outcome) => Math.max((outcome.attempts ?? 1) - 1, 0)),
    ),
    mismatches,
  };
}

/** Nearest-rank percentile over an already sorted list. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const rank = Math.ceil(p * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function mapValues<K extends string, V, R>(
  record: Record<K, V>,
  fn: (value: V) => R,
): Record<K, R> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, fn(value as V)]),
  ) as Record<K, R>;
}
