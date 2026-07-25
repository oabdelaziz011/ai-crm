export const automationWorkflowsKey = (companyId: string | null) =>
  ["automation", "workflows", companyId] as const;

export const automationWorkflowKey = (companyId: string | null, workflowId: string | null) =>
  ["automation", "workflow", companyId, workflowId] as const;

export const automationHistoryKey = (companyId: string | null, page = 1, workflowId?: string) =>
  ["automation", "history", companyId, page, workflowId ?? "all"] as const;

export const automationExecutionHistoryKey = (executionId: string | null) =>
  ["automation", "execution-history", executionId] as const;

export const automationTemplatesKey = () => ["automation", "templates"] as const;
