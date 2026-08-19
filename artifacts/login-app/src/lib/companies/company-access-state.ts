import { resolveCompanyApprovalStatus } from "@/lib/companies/company-list-filters";
import type { Company } from "@/lib/types";

export type TenantCompanyAccessKind = "suspended" | "rejected";

export type TenantCompanyAccessBlock = {
  kind: TenantCompanyAccessKind;
  reason: string | null;
};

export function trimRequiredReason(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveTenantCompanyAccessBlock(input: {
  isSuperAdmin: boolean;
  status?: string | null;
  approvalStatus?: string | null;
  suspensionReason?: string | null;
  rejectionReason?: string | null;
}): TenantCompanyAccessBlock | null {
  if (input.isSuperAdmin) return null;
  if (input.status === "Suspended") {
    return { kind: "suspended", reason: trimRequiredReason(input.suspensionReason) };
  }
  if (input.approvalStatus === "rejected") {
    return { kind: "rejected", reason: trimRequiredReason(input.rejectionReason) };
  }
  return null;
}

export function companyInternalFlag(
  company: Pick<Company, "status" | "approval_status">,
): TenantCompanyAccessKind | null {
  const approval = resolveCompanyApprovalStatus(company);
  if (company.status === "Suspended") return "suspended";
  if (approval === "rejected") return "rejected";
  return null;
}

export function companyAccessReason(
  company: Pick<Company, "status" | "approval_status" | "approval_rejection_reason"> & {
    suspension_reason?: string | null;
  },
): string | null {
  const flag = companyInternalFlag(company);
  if (flag === "suspended") return trimRequiredReason(company.suspension_reason);
  if (flag === "rejected") return trimRequiredReason(company.approval_rejection_reason);
  return null;
}

export function canRejectCompany(company: Pick<Company, "approval_status">): boolean {
  return resolveCompanyApprovalStatus(company) === "pending";
}

export function viewOpensReviewWizard(): boolean {
  return false;
}
