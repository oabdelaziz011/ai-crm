/** Context passed to document validation extensions. Core remains feature-agnostic. */
export type WorkflowValidationContext = {
  /** When omitted, contextual checks (e.g. channel bindings) are skipped — not treated as failures. */
  channelBindings?: ReadonlyArray<{
    channel: string | null;
    isEnabled: boolean;
  }>;
};

export const EMPTY_WORKFLOW_VALIDATION_CONTEXT: WorkflowValidationContext = {};
