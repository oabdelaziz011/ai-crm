/** React Query keys for workflow builder list/detail fetches. */
export const workflowBuilderWorkflowsKey = (companyId: string | null) =>
  ["workflow-builder", "workflows", companyId] as const;

export const workflowBuilderWorkflowKey = (companyId: string | null, flowId: string | null) =>
  ["workflow-builder", "workflow", companyId, flowId] as const;
