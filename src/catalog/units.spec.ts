import { toCanonicalQuantity } from './units';

describe('toCanonicalQuantity', () => {
  it.each([
    [1, 'l', 1000, 'ml'],
    [1.5, 'l', 1500, 'ml'],
    [2.25, 'l', 2250, 'ml'],
    [1.1, 'l', 1100, 'ml'],
    [75, 'cl', 750, 'ml'],
    [500, 'cc', 500, 'ml'],
    [500, 'ml', 500, 'ml'],
    [1, 'kg', 1000, 'g'],
    [0.25, 'kg', 250, 'g'],
    [400, 'g', 400, 'g'],
    [6, 'unidad', 6, 'unidad'],
  ] as const)('converts %d %s to %d %s', (quantity, unit, expected, target) => {
    expect(toCanonicalQuantity(quantity, unit)).toEqual({
      quantity: expected,
      unit: target,
    });
  });

  it('keeps the canonical unit when the product is sold by weight without a quantity', () => {
    expect(toCanonicalQuantity(null, 'kg')).toEqual({
      quantity: null,
      unit: 'g',
    });
  });

  it('drops a quantity that has no unit to interpret it', () => {
    expect(toCanonicalQuantity(3, null)).toEqual({
      quantity: null,
      unit: null,
    });
    expect(toCanonicalQuantity(null, null)).toEqual({
      quantity: null,
      unit: null,
    });
  });
});
