import type { PromptContextInput } from "../types.js";

/**
 * Normalizes prompt context input for orchestration.
 * No provider-specific transformations are applied here.
 */
export class PromptContextService {
  normalize(input: PromptContextInput): PromptContextInput {
    const extended = input as PromptContextInput & { customer360?: Record<string, unknown> | null };
    return {
      ...input,
      language: input.language ?? "English",
      tone: input.tone ?? "professional",
      recentMessages: input.recentMessages ?? [],
      toolResults: input.toolResults ?? [],
      companyPolicies: input.companyPolicies ?? [],
      formattingRules: input.formattingRules ?? [],
      safetyInstructions: input.safetyInstructions ?? [],
      systemInstructions: input.systemInstructions ?? [],
      customer360: input.customer360 ?? extended.customer360 ?? null,
    };
  }
}
