import { AUTOMATION_PERMISSIONS } from "@workspace/automation-platform";

export function hasWorkflowSimulationPermission(
  hasPermission: (code: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return (
    isSuperAdmin ||
    hasPermission(AUTOMATION_PERMISSIONS.view) ||
    hasPermission(AUTOMATION_PERMISSIONS.simulate)
  );
}
