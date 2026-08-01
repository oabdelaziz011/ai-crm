export const WORKFLOW_SIMULATION_KEY = ["workflow-builder", "simulation"] as const;

export function workflowSimulationKey(companyId: string | null, flowId: string | null) {
  return [...WORKFLOW_SIMULATION_KEY, companyId, flowId] as const;
}
