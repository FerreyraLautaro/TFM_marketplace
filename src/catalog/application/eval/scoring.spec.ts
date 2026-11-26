import type { NormalizationProposal } from '../../domain/normalization-proposal';
import {
  ExpectedProposal,
  ItemOutcome,
  isFieldCorrect,
  percentile,
  scoreRun,
} from './scoring';

const expected: ExpectedProposal = {
  brand: 'La Serenísima',
  brandStatus: 'MATCHED',
  productName: 'Leche entera',
  quantity: 1000,
  unit: 'ml',
  category: 'LACTEOS',
};

const proposal = (
  overrides: Partial<NormalizationProposal> = {},
): NormalizationProposal => ({
  brand: 'La Serenísima',
  brandStatus: 'MATCHED',
  brandId: 'brand-id',
  matchedBy: 'alias',
  extractedBrand: 'SERENISIMA',
  productName: 'LECHE ENTERA',
  quantity: 1000,
  unit: 'ml',
  category: 'LACTEOS',
  confidence: 'high',
  ...overrides,
});

const outcome = (
  id: number,
  overrides: Partial<ItemOutcome> = {},
): ItemOutcome => ({
  id,
  rawText: `item ${id}`,
  expected,
  status: 'SUCCESS',
  proposal: proposal(),
  attempts: 1,
  latencyMs: 1000,
  inputTokens: 100,
  outputTokens: 20,
  ...overrides,
});

describe('isFieldCorrect', () => {
  it('compares brands and product names ignoring case, accents and punctuation', () => {
    expect(
      isFieldCorrect('brand', expected, proposal({ brand: 'LA SERENISIMA' })),
    ).toBe(true);
    expect(isFieldCorrect('productName', expected, proposal())).toBe(true);
    expect(
      isFieldCorrect('brand', { ...expected, brand: null }, proposal()),
    ).toBe(false);
  });

  it('treats null quantities as a value of their own', () => {
    const byWeight = { ...expected, quantity: null, unit: 'g' as const };
    expect(
      isFieldCorrect('quantity', byWeight, proposal({ quantity: null })),
    ).toBe(true);
    expect(
      isFieldCorrect('quantity', byWeight, proposal({ quantity: 1000 })),
    ).toBe(false);
  });
});

describe('scoreRun', () => {
  it('computes per-field accuracy, full matches, tokens and retries', () => {
    const score = scoreRun([
      outcome(1),
      outcome(2, {
        proposal: proposal({ category: 'SIN_CATEGORIA' }),
        attempts: 3,
      }),
    ]);

    expect(score.fieldAccuracy.category).toBe(0.5);
    expect(score.fieldAccuracy.brand).toBe(1);
    expect(score.fullMatch).toBe(0.5);
    expect(score.retries).toBe(2);
    expect(score.tokens).toEqual({ input: 200, output: 40 });
    expect(score.mismatches).toEqual([
      {
        id: 2,
        rawText: 'item 2',
        field: 'category',
        expected: 'LACTEOS',
        actual: 'SIN_CATEGORIA',
      },
    ]);
  });

  it('counts failed calls as wrong on every field', () => {
    const score = scoreRun([
      outcome(1),
      outcome(2, { status: 'INVALID_OUTPUT', proposal: undefined }),
    ]);

    expect(score.statuses).toEqual({ SUCCESS: 1, INVALID_OUTPUT: 1, ERROR: 0 });
    expect(score.fieldAccuracy.unit).toBe(0.5);
    expect(score.fullMatch).toBe(0.5);
    expect(score.mismatches[0]).toMatchObject({
      field: 'status',
      actual: 'INVALID_OUTPUT',
    });
  });

  it('does not let a wrong productName break a full match', () => {
    const score = scoreRun([
      outcome(1, { proposal: proposal({ productName: 'Leche' }) }),
    ]);
    expect(score.fullMatch).toBe(1);
    expect(score.fieldAccuracy.productName).toBe(0);
  });
});

describe('percentile', () => {
  it('uses the nearest rank and handles empty lists', () => {
    expect(percentile([100, 200, 300, 400], 0.5)).toBe(200);
    expect(percentile([100, 200, 300, 400], 0.95)).toBe(400);
    expect(percentile([], 0.5)).toBeNull();
  });
});
