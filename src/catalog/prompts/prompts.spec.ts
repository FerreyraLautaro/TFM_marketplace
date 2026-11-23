import { CATEGORIES } from '../categories';
import {
  CURRENT_PROMPT_VERSION,
  PROMPTS,
  PROMPT_VERSIONS,
  getPrompt,
} from './index';

describe('prompt registry', () => {
  it('registers every prompt under its own version', () => {
    for (const version of PROMPT_VERSIONS) {
      expect(PROMPTS[version].version).toBe(version);
    }
  });

  it('defaults to the current version', () => {
    expect(PROMPT_VERSIONS).toContain(CURRENT_PROMPT_VERSION);
    expect(getPrompt()).toBe(PROMPTS[CURRENT_PROMPT_VERSION]);
  });

  it('v1 lists every category and wraps the raw text as data', () => {
    const v1 = getPrompt('v1');

    for (const category of CATEGORIES) {
      expect(v1.systemInstruction).toContain(category);
    }
    expect(v1.buildPrompt('LECHE SERENISIMA ENTERA 1LT')).toContain(
      '"""\nLECHE SERENISIMA ENTERA 1LT\n"""',
    );
  });
});
