export const WORKFLOW_DEBUGGER_KEY = ["workflow-builder", "debugger"] as const;

export function workflowDebuggerKey(companyId: string | null, flowId: string | null) {
  return [...WORKFLOW_DEBUGGER_KEY, companyId, flowId] as const;
}
