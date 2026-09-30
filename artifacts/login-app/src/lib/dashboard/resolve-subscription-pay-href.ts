import { toDashboardAbsolutePath } from "@/lib/routing";
import { companyWorkspaceHref } from "@/lib/company-workspace/company-workspace-routes";
import {
  canOpenWorkspaceBilling,
  canUpdateCompany,
  canViewCompanySubscription,
  canViewCompanyWorkspace,
} from "@/lib/company-workspace/permissions";

type Access = {
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

/**
 * Destination for “Pay subscription” CTAs.
 * Prefer Company Workspace subscription (has Visa / online pay panel).
 * Fall back to Workspace Billing when the user can open billing but not company workspace.
 */
export function resolveSubscriptionPayHref(access: Access): string {
  const canCompanySurface =
    canViewCompanyWorkspace(access) || canViewCompanySubscription(access);
  if (canCompanySurface) {
    return companyWorkspaceHref("subscription");
  }
  if (canOpenWorkspaceBilling(access) || canUpdateCompany(access)) {
    return `~${toDashboardAbsolutePath("/workspace/billing")}`;
  }
  return companyWorkspaceHref("subscription");
}

/** Whether the viewer may open a pay destination at all. */
export function canOpenSubscriptionPaySurface(access: Access): boolean {
  return (
    canViewCompanyWorkspace(access) ||
    canViewCompanySubscription(access) ||
    canOpenWorkspaceBilling(access) ||
    canUpdateCompany(access)
  );
}
