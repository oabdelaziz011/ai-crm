import type { AIWorkflowAutomationContext } from "../../types/automation-context.js";
import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import { DECISION_MODE_DISPLAY_NAMES } from "./constants.js";
import { readDecisionMetadata, type DecisionOutcome } from "./types.js";

function stringifyInput(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resolveDecisionInput(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): string {
  const decision = readDecisionMetadata(config);
  if (decision.inputSource === "static") {
    return decision.staticText?.trim() ?? "";
  }
  if (decision.inputSource === "conversation_message") {
    return stringifyInput(
      context.variables.__lastUserMessage ??
        context.input?.message ??
        context.variables.input ??
        "",
    ).trim();
  }
  const key = decision.inputVariable?.trim() ?? "input";
  return stringifyInput(context.variables[key]).trim();
}

export function formatDecisionOptions(outcomes: DecisionOutcome[]): string {
  return outcomes
    .map((outcome) => {
      const examples =
        outcome.examples?.length ? `\n  Examples: ${outcome.examples.join("; ")}` : "";
      const description = outcome.description ? `\n  Description: ${outcome.description}` : "";
      return `- ${outcome.label}${description}${examples}`;
    })
    .join("\n");
}

export function formatDecisionExamples(outcomes: DecisionOutcome[]): string {
  const lines = outcomes.flatMap((outcome) =>
    (outcome.examples ?? []).map((example) => `${outcome.label}: ${example}`),
  );
  return lines.length ? lines.join("\n") : "No examples provided.";
}

export function buildDecisionOutputSchema(config: AIWorkflowNodeConfig): Record<string, unknown> {
  const decision = readDecisionMetadata(config);
  return {
    labels: decision.outcomes.map((outcome) => outcome.label),
    outcomes: decision.outcomes,
    mode: decision.decisionMode,
    fallbackOutcomeId: decision.fallbackOutcomeId,
    confidenceThreshold: decision.confidenceThreshold,
  };
}

export function buildDecisionPromptContext(
  config: AIWorkflowNodeConfig,
  context: AIWorkflowAutomationContext,
): Record<string, unknown> {
  const decision = readDecisionMetadata(config);
  const input = resolveDecisionInput(config, context);

  return {
    decision: {
      input,
      mode: decision.decisionMode,
      modeLabel: DECISION_MODE_DISPLAY_NAMES[decision.decisionMode],
      options: formatDecisionOptions(decision.outcomes),
      outcomes: decision.outcomes,
      rules: decision.businessRules,
      examples: formatDecisionExamples(decision.outcomes),
      confidenceThreshold: decision.confidenceThreshold,
      fallbackOutcomeId: decision.fallbackOutcomeId,
    },
  };
}

export function estimateDecisionTokenRange(inputText: string, outcomeCount: number): { min: number; max: number } {
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const optionTokens = Math.max(24, outcomeCount * 20);
  const outputTokens = 64;
  return {
    min: inputTokens + optionTokens + Math.ceil(outputTokens * 0.5),
    max: inputTokens + optionTokens + outputTokens + 128,
  };
}
