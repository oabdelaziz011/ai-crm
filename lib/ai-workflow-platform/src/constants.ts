export const AI_WORKFLOW_FRAMEWORK_VERSION = "1.0.0";

export const AI_WORKFLOW_ACTION = "ai_workflow" as const;

export const AI_OUTPUT_MODES = [
  "text",
  "json",
  "boolean",
  "classification",
  "structured",
  "array",
] as const;

export type AIOutputMode = (typeof AI_OUTPUT_MODES)[number];

export const AI_NODE_CATEGORIES = [
  "generation",
  "understanding",
  "knowledge",
  "transformation",
  "vision",
  "utility",
] as const;

export type AINodeCategory = (typeof AI_NODE_CATEGORIES)[number];

export const AI_WORKFLOW_CAPABILITIES = [
  "usesKnowledge",
  "retrievalOnly",
  "usesStreaming",
  "supportsJson",
  "supportsImages",
  "supportsVision",
  "supportsToolCalling",
  "supportsMemory",
  "supportsContext",
] as const;

export type AIWorkflowCapability = (typeof AI_WORKFLOW_CAPABILITIES)[number];
