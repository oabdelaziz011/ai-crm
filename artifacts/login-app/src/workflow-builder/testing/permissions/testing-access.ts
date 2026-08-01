import { hasWorkflowSimulationPermission } from "../../simulation/permissions/workflow-simulation-access";

export function hasWorkflowTestingPermission(
  hasPermission: (permission: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return hasWorkflowSimulationPermission(hasPermission, isSuperAdmin);
}
