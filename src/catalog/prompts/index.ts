import { PromptTemplate } from './prompt-template';
import { promptV1 } from './v1.prompt';

/** Prompts by version, so new versions sit next to the old ones and any can be evaluated. */
export const PROMPTS = {
  v1: promptV1,
} as const satisfies Record<string, PromptTemplate>;

export type PromptVersion = keyof typeof PROMPTS;

export const PROMPT_VERSIONS = Object.keys(PROMPTS) as PromptVersion[];

export const CURRENT_PROMPT_VERSION: PromptVersion = 'v1';

export function getPrompt(
  version: PromptVersion = CURRENT_PROMPT_VERSION,
): PromptTemplate {
  return PROMPTS[version];
}

export type { PromptTemplate } from './prompt-template';
