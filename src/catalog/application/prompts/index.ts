import { PromptTemplate } from './prompt-template';
import { promptV1 } from './v1.prompt';
import { promptV2 } from './v2.prompt';

/** Prompts by version, so new versions sit next to the old ones and any can be evaluated. */
export const PROMPTS = {
  v1: promptV1,
  v2: promptV2,
} as const satisfies Record<string, PromptTemplate>;

export type PromptVersion = keyof typeof PROMPTS;

export const PROMPT_VERSIONS = Object.keys(PROMPTS) as PromptVersion[];

// v2 fixed every v1 error class in the evaluation (eval/reports/comparacion-v1-vs-v2.md).
export const CURRENT_PROMPT_VERSION: PromptVersion = 'v2';

export function getPrompt(
  version: PromptVersion = CURRENT_PROMPT_VERSION,
): PromptTemplate {
  return PROMPTS[version];
}

export type { PromptTemplate } from './prompt-template';
