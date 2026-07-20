import type { AIWorkflowCapability } from "../constants.js";

export type AIWorkflowValidationIssue = {
  id: string;
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
};

export type AIWorkflowValidationResult = {
  valid: boolean;
  issues: AIWorkflowValidationIssue[];
};

export type AIWorkflowValidationContext = {
  nodeKey?: string;
  capabilities?: AIWorkflowCapability[];
  hasProviderResolver?: boolean;
};
