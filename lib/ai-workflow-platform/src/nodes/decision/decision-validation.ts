import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import type { AIWorkflowValidationIssue } from "../../types/validation.js";
import { readDecisionMetadata } from "./types.js";

export function validateDecisionOutcomes(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const decision = readDecisionMetadata(config);
  const issues: AIWorkflowValidationIssue[] = [];

  if (decision.decisionMode !== "confidence_scoring" && decision.outcomes.length === 0) {
    issues.push({
      id: "missing-outcomes",
      code: "missing_decision_outcomes",
      field: "metadata.decision.outcomes",
      message: "Add at least one decision outcome.",
      severity: "error",
    });
    return issues;
  }

  const labels = new Set<string>();
  for (const outcome of decision.outcomes) {
    const normalized = outcome.label.trim().toLowerCase();
    if (!normalized) {
      issues.push({
        id: `empty-outcome-${outcome.id}`,
        code: "empty_outcome_label",
        field: "metadata.decision.outcomes",
        message: "Each decision outcome requires a label.",
        severity: "error",
      });
      continue;
    }
    if (labels.has(normalized)) {
      issues.push({
        id: `duplicate-outcome-${outcome.id}`,
        code: "duplicate_outcome_label",
        field: "metadata.decision.outcomes",
        message: `Duplicate decision outcome label: ${outcome.label}`,
        severity: "error",
      });
    }
    labels.add(normalized);
  }

  if (decision.fallbackOutcomeId) {
    const fallback = decision.outcomes.find((outcome) => outcome.id === decision.fallbackOutcomeId);
    if (!fallback) {
      issues.push({
        id: "invalid-fallback-outcome",
        code: "invalid_fallback_outcome",
        field: "metadata.decision.fallbackOutcomeId",
        message: "Fallback outcome must match one of the configured decision outcomes.",
        severity: "error",
      });
    }
  }

  if (decision.confidencePolicy.fallbackOutcomeId) {
    const fallback = decision.outcomes.find((outcome) => outcome.id === decision.confidencePolicy.fallbackOutcomeId);
    if (!fallback) {
      issues.push({
        id: "invalid-policy-fallback",
        code: "invalid_policy_fallback_outcome",
        field: "metadata.decision.confidencePolicy.fallbackOutcomeId",
        message: "Confidence policy fallback must match one of the configured decision outcomes.",
        severity: "error",
      });
    }
  }

  const threshold = decision.confidenceThreshold ?? decision.confidencePolicy.minimumConfidence;
  if (threshold != null && (threshold < 0 || threshold > 1)) {
    issues.push({
      id: "invalid-confidence-threshold",
      code: "invalid_confidence_threshold",
      field: "metadata.decision.confidenceThreshold",
      message: "Confidence threshold must be between 0 and 1.",
      severity: "error",
    });
  }

  return issues;
}

export function validateDecisionInput(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  const decision = readDecisionMetadata(config);
  if (decision.inputSource === "static") {
    if (decision.staticText?.trim()) return [];
    return [
      {
        id: "missing-static-input",
        code: "missing_static_input",
        field: "metadata.decision.staticText",
        message: "Enter source text to classify or choose another input source.",
        severity: "error",
      },
    ];
  }
  if (decision.inputSource === "conversation_message") return [];
  if (decision.inputVariable?.trim()) return [];
  return [
    {
      id: "missing-input-variable",
      code: "missing_input_variable",
      field: "metadata.decision.inputVariable",
      message: "Select a workflow variable containing the text to classify.",
      severity: "error",
    },
  ];
}

export function validateDecisionOutputVariable(config: AIWorkflowNodeConfig): AIWorkflowValidationIssue[] {
  if (config.outputVariable?.trim()) return [];
  return [
    {
      id: "missing-output-variable",
      code: "missing_output_variable",
      field: "outputVariable",
      message: "Define an output variable to store the decision result.",
      severity: "error",
    },
  ];
}

export function registerDecisionValidationRules(
  register: (nodeKey: string, rule: (config: AIWorkflowNodeConfig) => AIWorkflowValidationIssue[]) => void,
): void {
  register("ai.decision", validateDecisionOutcomes);
  register("ai.decision", validateDecisionInput);
  register("ai.decision", validateDecisionOutputVariable);
}
