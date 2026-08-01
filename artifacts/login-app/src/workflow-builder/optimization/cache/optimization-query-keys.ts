export function workflowOptimizationKey(companyId: string | null, flowId: string | null) {
  return ["workflow-builder", "optimization", companyId, flowId] as const;
}
