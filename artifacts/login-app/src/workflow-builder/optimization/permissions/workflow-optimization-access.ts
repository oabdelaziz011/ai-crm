export function hasWorkflowOptimizationPermission(
  hasPermission: (permission: string) => boolean,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || hasPermission("automation.view");
}
