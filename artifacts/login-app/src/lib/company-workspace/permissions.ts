/**
 * Company Workspace RBAC — Job Title NEVER grants these.
 * Roles remain the only authorization source.
 */
export const COMPANY_WORKSPACE_PERMISSIONS = {
  view: "company.view",
  update: "company.update",
  branding: "company.branding",
  subscription: "company.subscription",
  employeesManage: "employees.manage",
  branchesManage: "branches.manage",
  departmentsManage: "departments.manage",
} as const;

type Access = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

function can(access: Access, code: string, fallbacks: string[] = []): boolean {
  if (access.isSuperAdmin) return true;
  if (access.hasPermission(code)) return true;
  return fallbacks.some((fallback) => access.hasPermission(fallback));
}

export function canViewCompanyWorkspace(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.view, ["settings.view", "settings.edit"]);
}

export function canUpdateCompany(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.update, ["settings.edit", "companies.edit"]);
}

export function canManageCompanyBranding(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.branding, ["settings.edit"]);
}

export function canViewCompanySubscription(access: Access): boolean {
  // Do not fall back to workspace.view — billing routes require billing.view_own.
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.subscription, [
    "subscriptions.view",
    "billing.view_own",
  ]);
}

/**
 * Initiate online SaaS checkout from the company portal.
 * Requires company update (admin) — view-only subscription access is insufficient.
 */
export function canInitiateCompanyOnlinePayment(access: Access): boolean {
  return canUpdateCompany(access);
}

/** Deep-link to Workspace Billing (upgrade/history) — stricter than tab visibility. */
export function canOpenWorkspaceBilling(access: Access): boolean {
  if (access.isSuperAdmin) return true;
  return access.hasPermission("billing.view_own") || access.hasPermission("billing.view");
}

export function canManageCompanyEmployees(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.employeesManage, ["users.edit", "users.create"]);
}

export function canManageCompanyBranches(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.branchesManage, ["settings.edit", "scheduling.edit"]);
}

export function canManageCompanyDepartments(access: Access): boolean {
  return can(access, COMPANY_WORKSPACE_PERMISSIONS.departmentsManage, ["organization.manage", "settings.edit"]);
}
