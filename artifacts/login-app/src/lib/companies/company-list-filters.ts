import type { Company, CompanyApprovalStatus, CompanyStatus } from "@/lib/types";

export type CompanyWorkspaceTab =
  | "pending"
  | "active"
  | "trial"
  | "suspended"
  | "all";

export function resolveCompanyApprovalStatus(
  company: Pick<Company, "approval_status">,
): CompanyApprovalStatus {
  return company.approval_status ?? "approved";
}

export function matchesCompanyWorkspaceTab(
  company: Pick<Company, "status" | "approval_status">,
  tab: CompanyWorkspaceTab,
): boolean {
  const approval = resolveCompanyApprovalStatus(company);

  switch (tab) {
    case "pending":
      return approval === "pending";
    case "active":
      return approval === "approved" && company.status === "Active";
    case "trial":
      return approval === "approved" && company.status === "Trial";
    case "suspended":
      return approval === "approved" && company.status === "Suspended";
    case "all":
      return true;
    default:
      return true;
  }
}

export function countCompaniesByWorkspaceTab(
  companies: Array<Pick<Company, "status" | "approval_status">>,
): Record<CompanyWorkspaceTab, number> {
  const counts: Record<CompanyWorkspaceTab, number> = {
    pending: 0,
    active: 0,
    trial: 0,
    suspended: 0,
    all: companies.length,
  };

  for (const company of companies) {
    if (matchesCompanyWorkspaceTab(company, "pending")) counts.pending += 1;
    if (matchesCompanyWorkspaceTab(company, "active")) counts.active += 1;
    if (matchesCompanyWorkspaceTab(company, "trial")) counts.trial += 1;
    if (matchesCompanyWorkspaceTab(company, "suspended")) counts.suspended += 1;
  }

  return counts;
}

export function isAccountLifecycleStatus(status: string): status is CompanyStatus {
  return status === "Active" || status === "Trial" || status === "Suspended";
}
