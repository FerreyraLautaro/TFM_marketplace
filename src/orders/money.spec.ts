import { commissionCents, fromCents, toCents } from './money';

describe('money helpers', () => {
  it('converts amounts to integer cents without float drift', () => {
    expect(toCents(1250.5)).toBe(125050);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });

  it('converts cents back to amounts', () => {
    expect(fromCents(125050)).toBe(1250.5);
    expect(fromCents(1999)).toBe(19.99);
  });

  it('computes the commission rounding half up to the nearest cent', () => {
    expect(commissionCents(10000, 10)).toBe(1000);
    // 5% of 0.99 = 4.95 cents -> 5
    expect(commissionCents(99, 5)).toBe(5);
    // 15% of 0.33 = 4.95 cents -> 5
    expect(commissionCents(33, 15)).toBe(5);
    // 5% of 0.89 = 4.45 cents -> 4
    expect(commissionCents(89, 5)).toBe(4);
  });

  it('supports fractional rates', () => {
    // 12.5% of 10.01 = 125.125 cents -> 125
    expect(commissionCents(1001, 12.5)).toBe(125);
  });
});
