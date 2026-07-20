import type { AIOutputMode } from "../constants.js";
import type { AIWorkflowNodeConfig } from "./configuration.js";
import type { AIWorkflowValidationIssue } from "./validation.js";

export type AIWorkflowPreviewInput = {
  config: AIWorkflowNodeConfig;
  workflowVariables?: Record<string, unknown>;
};

export type AIWorkflowPreviewResult = {
  configuration: AIWorkflowNodeConfig;
  promptTemplateKey: string | null;
  outputMode: AIOutputMode;
  outputSchema: Record<string, unknown> | null;
  knowledgeEnabled: boolean;
  knowledgeSummary: string | null;
  runtimeMetadata: {
    estimatedTokens: number | null;
    providerKey: string | null;
    model: string | null;
    streaming: boolean;
  };
  validationIssues: AIWorkflowValidationIssue[];
  expectedOutput?: string | null;
  estimatedTokenRange?: { min: number; max: number } | null;
  nodeMetadata?: Record<string, unknown> | null;
};
