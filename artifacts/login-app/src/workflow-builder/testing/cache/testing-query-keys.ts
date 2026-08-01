export function workflowTestingKey(companyId: string | null, flowId: string | null) {
  return ["workflow-builder", "testing", companyId, flowId] as const;
}
