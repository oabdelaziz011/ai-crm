import type { AIWorkflowNodeConfig } from "../../types/configuration.js";
import {
  AI_DECISION_NODE_KEY,
  DEFAULT_DECISION_OUTPUT_VARIABLE,
  DEFAULT_DECISION_PROMPT_TEMPLATE_KEY,
  DECISION_MODES,
  type DecisionInputSource,
  type DecisionMode,
} from "./constants.js";

export type DecisionOutcome = {
  id: string;
  label: string;
  description?: string | null;
  examples?: string[] | null;
};

export type DecisionConfidencePolicy = {
  minimumConfidence: number | null;
  fallbackOutcomeId: string | null;
  retryOnce: boolean;
  requireHumanReview: boolean;
  emitWarning: boolean;
  continueWorkflow: boolean;
};

export type AIDecisionNodeMetadata = {
  decisionMode: DecisionMode;
  inputSource: DecisionInputSource;
  inputVariable: string | null;
  staticText: string | null;
  businessRules: string | null;
  outcomes: DecisionOutcome[];
  confidenceThreshold: number | null;
  fallbackOutcomeId: string | null;
  confidencePolicy: DecisionConfidencePolicy;
};

const DEFAULT_OUTCOMES_BY_MODE: Record<DecisionMode, DecisionOutcome[]> = {
  intent_classification: [
    { id: "intent-sales", label: "sales", description: "Sales or pricing inquiry" },
    { id: "intent-support", label: "support", description: "Product support request" },
    { id: "intent-billing", label: "billing", description: "Billing or invoice question" },
    { id: "intent-other", label: "other", description: "General or unknown intent" },
  ],
  category_classification: [
    { id: "cat-general", label: "general", description: "General inquiry" },
    { id: "cat-technical", label: "technical", description: "Technical issue" },
    { id: "cat-account", label: "account", description: "Account management" },
  ],
  priority_classification: [
    { id: "prio-low", label: "low", description: "Low urgency" },
    { id: "prio-medium", label: "medium", description: "Normal priority" },
    { id: "prio-high", label: "high", description: "High priority" },
    { id: "prio-urgent", label: "urgent", description: "Urgent escalation" },
  ],
  sentiment: [
    { id: "sent-positive", label: "positive", description: "Positive sentiment" },
    { id: "sent-neutral", label: "neutral", description: "Neutral sentiment" },
    { id: "sent-negative", label: "negative", description: "Negative sentiment" },
  ],
  approval_decision: [
    { id: "approve-yes", label: "approved", description: "Approved" },
    { id: "approve-no", label: "rejected", description: "Rejected" },
    { id: "approve-review", label: "needs_review", description: "Requires human review" },
  ],
  binary_decision: [
    { id: "binary-yes", label: "yes", description: "Affirmative decision" },
    { id: "binary-no", label: "no", description: "Negative decision" },
  ],
  multi_class_decision: [
    { id: "class-a", label: "class_a", description: "Class A" },
    { id: "class-b", label: "class_b", description: "Class B" },
    { id: "class-c", label: "class_c", description: "Class C" },
  ],
  confidence_scoring: [],
  custom_decision: [
    { id: "custom-default", label: "default", description: "Default outcome" },
  ],
};

export function createDefaultDecisionOutcomes(mode: DecisionMode = "intent_classification"): DecisionOutcome[] {
  return DEFAULT_OUTCOMES_BY_MODE[mode].map((outcome) => ({
    ...outcome,
    id: outcome.id || crypto.randomUUID(),
    examples: outcome.examples ?? [],
  }));
}

export function createDefaultDecisionConfidencePolicy(
  overrides: Partial<DecisionConfidencePolicy> = {},
): DecisionConfidencePolicy {
  return {
    minimumConfidence: 0.7,
    fallbackOutcomeId: null,
    retryOnce: false,
    requireHumanReview: false,
    emitWarning: true,
    continueWorkflow: true,
    ...overrides,
  };
}

export function createDefaultDecisionMetadata(
  overrides: Partial<AIDecisionNodeMetadata> = {},
): AIDecisionNodeMetadata {
  const decisionMode = overrides.decisionMode ?? "intent_classification";
  const base = {
    decisionMode,
    inputSource: "variable" as const,
    inputVariable: "input",
    staticText: null,
    businessRules: "Choose the best matching outcome based only on the provided input.",
    outcomes: createDefaultDecisionOutcomes(decisionMode),
    confidenceThreshold: 0.7,
    fallbackOutcomeId: null,
    confidencePolicy: createDefaultDecisionConfidencePolicy(),
  };
  return {
    ...base,
    ...overrides,
    outcomes: overrides.outcomes ?? base.outcomes,
    confidencePolicy: {
      ...base.confidencePolicy,
      ...overrides.confidencePolicy,
    },
  };
}

function normalizeOutcome(raw: Record<string, unknown>): DecisionOutcome | null {
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  if (!label) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
    label,
    description: typeof raw.description === "string" ? raw.description : null,
    examples: Array.isArray(raw.examples) ? raw.examples.map(String) : [],
  };
}

export function readDecisionMetadata(config: AIWorkflowNodeConfig): AIDecisionNodeMetadata {
  const raw = config.metadata?.decision;
  if (!raw || typeof raw !== "object") return createDefaultDecisionMetadata();
  const value = raw as Record<string, unknown>;
  const decisionMode = DECISION_MODES.includes(value.decisionMode as DecisionMode)
    ? (value.decisionMode as DecisionMode)
    : "intent_classification";
  const inputSource = ["variable", "static", "conversation_message"].includes(String(value.inputSource))
    ? (value.inputSource as DecisionInputSource)
    : "variable";
  const outcomes = Array.isArray(value.outcomes)
    ? value.outcomes
        .map((entry) => (entry && typeof entry === "object" ? normalizeOutcome(entry as Record<string, unknown>) : null))
        .filter((entry): entry is DecisionOutcome => Boolean(entry))
    : createDefaultDecisionOutcomes(decisionMode);
  const policyRaw =
    value.confidencePolicy && typeof value.confidencePolicy === "object"
      ? (value.confidencePolicy as Record<string, unknown>)
      : {};
  return createDefaultDecisionMetadata({
    decisionMode,
    inputSource,
    inputVariable: typeof value.inputVariable === "string" ? value.inputVariable : "input",
    staticText: typeof value.staticText === "string" ? value.staticText : null,
    businessRules: typeof value.businessRules === "string" ? value.businessRules : null,
    outcomes: Array.isArray(value.outcomes) ? outcomes : outcomes.length ? outcomes : createDefaultDecisionOutcomes(decisionMode),
    confidenceThreshold: typeof value.confidenceThreshold === "number" ? value.confidenceThreshold : 0.7,
    fallbackOutcomeId: typeof value.fallbackOutcomeId === "string" ? value.fallbackOutcomeId : null,
    confidencePolicy: createDefaultDecisionConfidencePolicy({
      minimumConfidence:
        typeof policyRaw.minimumConfidence === "number" ? policyRaw.minimumConfidence : 0.7,
      fallbackOutcomeId:
        typeof policyRaw.fallbackOutcomeId === "string" ? policyRaw.fallbackOutcomeId : null,
      retryOnce: policyRaw.retryOnce === true,
      requireHumanReview: policyRaw.requireHumanReview === true,
      emitWarning: policyRaw.emitWarning !== false,
      continueWorkflow: policyRaw.continueWorkflow !== false,
    }),
  });
}

export function patchDecisionMetadata(
  config: AIWorkflowNodeConfig,
  patch: Partial<AIDecisionNodeMetadata>,
): AIWorkflowNodeConfig {
  const current = readDecisionMetadata(config);
  const nextMode = patch.decisionMode ?? current.decisionMode;
  return {
    ...config,
    metadata: {
      ...config.metadata,
      decision: {
        ...current,
        ...patch,
        decisionMode: nextMode,
        outcomes:
          patch.outcomes ??
          (patch.decisionMode && patch.decisionMode !== current.decisionMode
            ? createDefaultDecisionOutcomes(nextMode)
            : current.outcomes),
        confidencePolicy: {
          ...current.confidencePolicy,
          ...patch.confidencePolicy,
        },
      },
    },
  };
}

export function createDefaultDecisionNodeConfig(): AIWorkflowNodeConfig {
  return {
    nodeKey: AI_DECISION_NODE_KEY,
    nodeVersion: "1.0.0",
    promptTemplateKey: DEFAULT_DECISION_PROMPT_TEMPLATE_KEY,
    promptTemplateType: "classification",
    outputMode: "structured",
    outputVariable: DEFAULT_DECISION_OUTPUT_VARIABLE,
    outputSchema: null,
    policies: {
      temperature: 0,
      maxTokens: 1024,
      streaming: false,
      responseFormat: "json",
    },
    knowledge: {
      enabled: false,
      collectionId: null,
      embeddingConnectionId: null,
      vectorStoreConnectionId: null,
      maxChunks: 8,
      similarityThreshold: 0.7,
      queryTemplate: null,
    },
    metadata: {
      decision: createDefaultDecisionMetadata(),
    },
  };
}

export { AI_DECISION_NODE_KEY };
