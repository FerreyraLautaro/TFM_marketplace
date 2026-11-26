import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES } from '../../domain/categories';
import { textKey } from '../eval/scoring';
import { llmOutputSchema } from '../../domain/llm-output.schema';
import { V2_EXAMPLES, promptV2 } from './v2.prompt';

const golden = JSON.parse(
  readFileSync(join(__dirname, '../../../../eval/golden-dataset.json'), 'utf8'),
) as { items: Array<{ rawText: string; expected: { productName: string } }> };

describe('prompt v2', () => {
  it('lists every category and keeps the raw text delimited as data', () => {
    for (const category of CATEGORIES) {
      expect(promptV2.systemInstruction).toContain(category);
    }
    expect(promptV2.buildPrompt('LECHE 1L')).toContain('"""\nLECHE 1L\n"""');
  });

  it('has examples that are valid model outputs', () => {
    for (const example of V2_EXAMPLES) {
      expect(llmOutputSchema.safeParse(example.output).success).toBe(true);
    }
  });

  // Guards against data leakage: an example equal to an evaluated item would
  // hand the model the expected answer and inflate the evaluation.
  it('never uses a golden dataset item as an example', () => {
    const goldenTexts = new Set(
      golden.items.map((item) => textKey(item.rawText)),
    );
    const goldenNames = new Set(
      golden.items.map((item) => textKey(item.expected.productName)),
    );
    for (const example of V2_EXAMPLES) {
      expect(goldenTexts.has(textKey(example.rawText))).toBe(false);
      expect(goldenNames.has(textKey(example.output.productName))).toBe(false);
    }
  });
});
