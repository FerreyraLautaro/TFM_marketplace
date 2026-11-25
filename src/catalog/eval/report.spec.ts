import { availability, onSuccess, renderComparison } from './report';
import type { EvaluationResult } from './report';
import type { RunScore } from './scoring';

const score = (
  success: number,
  error: number,
  fullMatch: number,
): RunScore => ({
  total: success + error,
  statuses: { SUCCESS: success, INVALID_OUTPUT: 0, ERROR: error },
  fieldAccuracy: {
    brand: fullMatch,
    brandStatus: fullMatch,
    quantity: fullMatch,
    unit: fullMatch,
    category: fullMatch,
    productName: fullMatch,
  },
  fullMatch,
  latencyMs: { p50: 1000, p95: 2000 },
  tokens: { input: success * 100, output: success * 20 },
  retries: 0,
  mismatches: [],
});

const result = (version: string, scores: RunScore[]): EvaluationResult => ({
  promptVersion: version,
  model: 'test-model',
  startedAt: '2026-01-01T00:00:00.000Z',
  datasetSize: 10,
  runsRequested: scores.length,
  partial: false,
  runs: scores.map((s, index) => ({
    run: index + 1,
    completed: true,
    score: s,
  })),
});

describe('availability and onSuccess', () => {
  it('separates provider failures from the quality of answered calls', () => {
    // 8 answered, 2 failed; 8 of 10 right overall means every answer was right.
    const s = score(8, 2, 0.8);
    expect(availability(s)).toBe(0.8);
    expect(onSuccess(s, s.fullMatch)).toBe(1);
  });

  it('returns 0 when nothing answered', () => {
    expect(onSuccess(score(0, 10, 0), 0)).toBe(0);
  });
});

describe('renderComparison', () => {
  it('does not report a quality drop caused only by provider outages', () => {
    // Same perfect answers; the candidate just had more outages.
    const report = renderComparison(
      result('v1', [score(10, 0, 1)]),
      result('v2', [score(8, 2, 0.8)]),
    );
    expect(report).toContain(
      '| **Todos los campos objetivos** | 100.0% | 100.0% | 0.0 pp |',
    );
    expect(report).toContain(
      '| Disponibilidad (llamadas que respondieron) | 100.0% | 80.0% |',
    );
  });
});
