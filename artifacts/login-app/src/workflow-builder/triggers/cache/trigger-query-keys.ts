export const WORKFLOW_TRIGGER_KEY = ["workflow-builder", "triggers"] as const;

export function workflowTriggerAnalyticsKey(companyId: string | null, flowId: string | null) {
  return [...WORKFLOW_TRIGGER_KEY, "analytics", companyId, flowId] as const;
}

export function workflowTriggerBindingsKey(companyId: string | null, flowId: string | null) {
  return [...WORKFLOW_TRIGGER_KEY, "bindings", companyId, flowId] as const;
}
