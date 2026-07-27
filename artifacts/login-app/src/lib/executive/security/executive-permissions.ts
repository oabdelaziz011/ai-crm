export const EXECUTIVE_PERMISSIONS = {
  view: "executive.view",
  manageAlerts: "executive.manage_alerts",
} as const;

export function canViewExecutiveDashboard(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(EXECUTIVE_PERMISSIONS.view) || permissions.includes("reports.view");
}

export function canManageExecutiveAlerts(permissions: string[], isSuperAdmin = false): boolean {
  return isSuperAdmin || permissions.includes(EXECUTIVE_PERMISSIONS.manageAlerts);
}

export function resolveExecutiveRole(roles: string[]): "owner" | "executive" | "regional_manager" | "branch_manager" {
  if (roles.includes("owner") || roles.includes("admin")) return "owner";
  if (roles.includes("manager")) return "regional_manager";
  if (roles.includes("branch_manager")) return "branch_manager";
  return "executive";
}
