export function workflowAnalyticsKey(companyId: string | null, flowId: string | null) {
  return ["workflow-builder", "analytics", companyId, flowId] as const;
}
