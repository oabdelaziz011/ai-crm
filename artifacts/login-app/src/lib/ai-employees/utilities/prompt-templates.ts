/** Starter system-prompt templates (fill text only — never restrict tools/knowledge). */
export const AI_EMPLOYEE_PROMPT_TEMPLATE_KEYS = [
  "support",
  "sales",
  "receptionist",
  "operations",
] as const;

export type AiEmployeePromptTemplateKey = (typeof AI_EMPLOYEE_PROMPT_TEMPLATE_KEYS)[number];

/** Suggested chat models by provider registry key. */
export const AI_EMPLOYEE_MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-latest"],
  google: ["gemini-2.0-flash", "gemini-1.5-pro"],
  azure: ["gpt-4o", "gpt-4o-mini"],
};
