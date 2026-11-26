import { z } from 'zod';
import { CATEGORIES } from './categories';
import { RAW_UNITS } from './units';

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

/**
 * Single source of truth for what the model must return: converted to JSON Schema
 * for the request and used again to validate the (untrusted) response.
 */
export const llmOutputSchema = z.object({
  brand: z
    .string()
    .nullable()
    .describe('Brand exactly as written in the text, or null if there is none'),
  productName: z
    .string()
    .min(1)
    .describe('Product name in Spanish, without brand or quantity'),
  quantity: z
    .number()
    .positive()
    .nullable()
    .describe('Net content as a number, or null if absent'),
  unit: z
    .enum(RAW_UNITS)
    .nullable()
    .describe('Unit of the quantity as written, or null if absent'),
  category: z.enum(CATEGORIES),
  confidence: z.enum(CONFIDENCE_LEVELS),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;

// JSON Schema keywords outside the subset Gemini's responseJsonSchema accepts.
const UNSUPPORTED_KEYWORDS = new Set([
  '$schema',
  'additionalProperties',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

/**
 * Converts a zod schema to the JSON Schema sent to the model, dropping keywords
 * the provider rejects. Dropping them only loosens the request: the full zod
 * schema still validates the response.
 */
export function toProviderJsonSchema(
  schema: z.ZodType,
): Record<string, unknown> {
  return stripKeywords(z.toJSONSchema(schema)) as Record<string, unknown>;
}

function stripKeywords(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripKeywords);
  }
  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node)
        .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
        .map(([key, value]) => [key, stripKeywords(value)]),
    );
  }
  return node;
}
