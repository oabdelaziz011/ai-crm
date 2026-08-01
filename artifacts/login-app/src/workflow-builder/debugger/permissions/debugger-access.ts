import { hasWorkflowSimulationPermission } from "../../simulation/permissions/workflow-simulation-access";

export function hasWorkflowDebuggerPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return hasWorkflowSimulationPermission(hasPermission, isSuperAdmin);
}
