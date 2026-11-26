export interface PromptTemplate {
  version: string;
  systemInstruction: string;
  buildPrompt(rawText: string): string;
}
