export const AI_DECISION_NODE_KEY = "ai.decision" as const;

export const DEFAULT_DECISION_PROMPT_TEMPLATE_KEY = "workflow_decision";

export const DEFAULT_DECISION_OUTPUT_VARIABLE = "decision_result";

export const DECISION_INPUT_SOURCES = ["variable", "static", "conversation_message"] as const;
export type DecisionInputSource = (typeof DECISION_INPUT_SOURCES)[number];

export const DECISION_MODES = [
  "intent_classification",
  "category_classification",
  "priority_classification",
  "sentiment",
  "approval_decision",
  "binary_decision",
  "multi_class_decision",
  "confidence_scoring",
  "custom_decision",
] as const;

export type DecisionMode = (typeof DECISION_MODES)[number];

export const DECISION_OUTPUT_MODES = ["classification", "structured", "json", "boolean", "array"] as const;

export const DECISION_MODE_DISPLAY_NAMES: Record<DecisionMode, string> = {
  intent_classification: "Intent Classification",
  category_classification: "Category Classification",
  priority_classification: "Priority Classification",
  sentiment: "Sentiment",
  approval_decision: "Approval Decision",
  binary_decision: "Binary Decision",
  multi_class_decision: "Multi-class Decision",
  confidence_scoring: "Confidence Scoring",
  custom_decision: "Custom Decision",
};
