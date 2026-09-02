import type { Company } from "@/lib/types";
import { resolveCompanyApprovalStatus } from "@/lib/companies/company-list-filters";

export type CompanyRowActionId =
  | "view"
  | "review"
  | "edit"
  | "features"
  | "subscription"
  | "extendTrial"
  | "changePackage"
  | "convertTrial"
  | "retryProvisioning"
  | "resetAdminPassword"
  | "suspend"
  | "restore"
  | "reject"
  | "delete";

export type CompanyRowActionCapabilities = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCommercial: boolean;
  canViewBilling: boolean;
  canEditBilling: boolean;
  /** Platform Super Admin only — never grant to tenant Company Admins. */
  canResetAdminPassword: boolean;
};

export type CompanyRowAction = {
  id: CompanyRowActionId;
  confirm: boolean;
};

const ACTION_ORDER: CompanyRowActionId[] = [
  "view",
  "review",
  "edit",
  "features",
  "subscription",
  "extendTrial",
  "changePackage",
  "convertTrial",
  "retryProvisioning",
  "resetAdminPassword",
  "suspend",
  "restore",
  "reject",
  "delete",
];

const CONFIRM_IDS = new Set<CompanyRowActionId>([
  "suspend",
  "restore",
  "reject",
  "delete",
  "changePackage",
  "convertTrial",
  "resetAdminPassword",
]);

export function visibleCompanyRowActions(
  company: Company,
  caps: CompanyRowActionCapabilities,
): CompanyRowAction[] {
  const approval = resolveCompanyApprovalStatus(company);
  const approved = approval === "approved";
  const pending = approval === "pending";
  const rejected = approval === "rejected";
  const failedProvisioning = company.tenant_provisioning_status === "failed";
  const trial = approved && company.status === "Trial";
  const suspended = approved && company.status === "Suspended";
  const activeOrTrial = approved && (company.status === "Active" || company.status === "Trial");

  const visible = new Set<CompanyRowActionId>();

  if (caps.canView) visible.add("view");
  if (caps.canCommercial && (pending || rejected)) visible.add("review");
  if (caps.canEdit) visible.add("edit");
  if (caps.canCommercial && approved) visible.add("features");
  if (caps.canViewBilling && approved) visible.add("subscription");
  if (caps.canCommercial && trial) visible.add("extendTrial");
  if (caps.canEditBilling && approved && !trial && !suspended) visible.add("changePackage");
  if (caps.canEditBilling && trial) visible.add("convertTrial");
  if (caps.canEdit && failedProvisioning) visible.add("retryProvisioning");
  if (caps.canResetAdminPassword) visible.add("resetAdminPassword");
  if (caps.canEditBilling && activeOrTrial) visible.add("suspend");
  if (caps.canEditBilling && suspended) visible.add("restore");
  if (caps.canCommercial && pending) visible.add("reject");
  if (caps.canDelete) visible.add("delete");

  return ACTION_ORDER.filter((id) => visible.has(id)).map((id) => ({
    id,
    confirm: CONFIRM_IDS.has(id),
  }));
}

export function companyRowActionRequiresConfirm(id: CompanyRowActionId): boolean {
  return CONFIRM_IDS.has(id);
}
