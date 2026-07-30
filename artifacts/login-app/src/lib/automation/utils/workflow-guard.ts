export class LegacyWorkflowFeatureDisabledError extends Error {
  readonly code = "WORKFLOW_FEATURE_DISABLED";

  constructor(message = "Workflow AI is disabled for this company.") {
    super(message);
    this.name = "LegacyWorkflowFeatureDisabledError";
  }
}

type LegacyWorkflowGuard = {
  isSuperAdmin: boolean;
  isEnabled: () => boolean;
};

let workflowGuard: LegacyWorkflowGuard | null = null;

export function setLegacyAutomationWorkflowGuard(guard: LegacyWorkflowGuard | null): void {
  workflowGuard = guard;
}

export function assertLegacyAutomationWorkflowEnabled(_companyId: string): void {
  if (!workflowGuard || workflowGuard.isSuperAdmin) {
    return;
  }
  if (!workflowGuard.isEnabled()) {
    throw new LegacyWorkflowFeatureDisabledError();
  }
}
