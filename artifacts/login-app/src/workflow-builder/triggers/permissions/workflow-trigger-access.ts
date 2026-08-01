import { AUTOMATION_PERMISSIONS } from "@workspace/automation-platform";
import { hasWorkflowSimulationPermission } from "../../simulation/permissions/workflow-simulation-access";

export function hasWorkflowTriggerViewPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AUTOMATION_PERMISSIONS.view);
}

export function hasWorkflowTriggerEditPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission(AUTOMATION_PERMISSIONS.edit);
}

export function hasWorkflowTriggerTestPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return hasWorkflowSimulationPermission(hasPermission, isSuperAdmin);
}
