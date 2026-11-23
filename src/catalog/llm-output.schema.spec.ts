import { CATEGORIES } from './categories';
import { llmOutputSchema, toProviderJsonSchema } from './llm-output.schema';

describe('toProviderJsonSchema', () => {
  const schema = toProviderJsonSchema(llmOutputSchema);

  it('drops keywords the provider rejects, at every level', () => {
    const serialized = JSON.stringify(schema);

    expect(serialized).not.toContain('$schema');
    expect(serialized).not.toContain('additionalProperties');
    expect(serialized).not.toContain('exclusiveMinimum');
  });

  it('keeps the fields, required list and closed enums', () => {
    expect(schema).toMatchObject({
      type: 'object',
      required: [
        'brand',
        'productName',
        'quantity',
        'unit',
        'category',
        'confidence',
      ],
      properties: {
        category: { enum: [...CATEGORIES] },
        confidence: { enum: ['high', 'medium', 'low'] },
      },
    });
  });
});

describe('llmOutputSchema', () => {
  const valid = {
    brand: 'SERENISIMA',
    productName: 'Leche entera',
    quantity: 1,
    unit: 'l',
    category: 'LACTEOS',
    confidence: 'high',
  };

  it('accepts a valid output', () => {
    expect(llmOutputSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['an unknown category', { category: 'QUESOS' }],
    ['an unknown unit', { unit: 'lt' }],
    ['a non-positive quantity', { quantity: 0 }],
    ['an empty product name', { productName: '' }],
  ])('rejects %s', (_label, change) => {
    expect(llmOutputSchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    );
  });
});
