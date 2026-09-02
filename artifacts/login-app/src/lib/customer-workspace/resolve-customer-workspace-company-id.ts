/**
 * Resolve the company_id used for Customer Workspace tabs (Activity / History / Campaigns).
 *
 * Canonical rule: once the customer row is loaded, customer.company_id wins.
 * Never invent a tenant from sessionStorage alone when it conflicts with the customer row.
 * Never use phone / email / last-9.
 */

export type ResolveCustomerWorkspaceCompanyIdInput = {
  customerCompanyId: string | null | undefined;
  profileCompanyId: string | null | undefined;
  contextCompanyId?: string | null | undefined;
  isSuperAdmin?: boolean;
};

export type ResolveCustomerWorkspaceCompanyIdResult =
  | { ok: true; companyId: string; source: "customer" | "profile" | "context" }
  | { ok: false; reason: "missing_customer_company" | "tenant_mismatch" };

/**
 * Prefer the loaded customer's company_id. Context/profile may hint before load,
 * but must not override a conflicting customer.company_id.
 */
export function resolveCustomerWorkspaceCompanyId(
  input: ResolveCustomerWorkspaceCompanyIdInput,
): ResolveCustomerWorkspaceCompanyIdResult {
  const customerCompanyId = input.customerCompanyId?.trim() || null;
  const profileCompanyId = input.profileCompanyId?.trim() || null;
  const contextCompanyId = input.contextCompanyId?.trim() || null;
  const isSuperAdmin = Boolean(input.isSuperAdmin);

  if (customerCompanyId) {
    if (
      !isSuperAdmin &&
      profileCompanyId &&
      profileCompanyId !== customerCompanyId
    ) {
      return { ok: false, reason: "tenant_mismatch" };
    }
    return { ok: true, companyId: customerCompanyId, source: "customer" };
  }

  // Customer row missing company_id — fail closed for Activity (do not guess from phone).
  if (contextCompanyId || profileCompanyId) {
    return { ok: false, reason: "missing_customer_company" };
  }

  return { ok: false, reason: "missing_customer_company" };
}

/** Hint used only before the customer row is available (route bootstrap). */
export function resolveCustomerWorkspaceCompanyIdHint(input: {
  profileCompanyId: string | null | undefined;
  contextCompanyId?: string | null | undefined;
}): string | null {
  return input.contextCompanyId?.trim() || input.profileCompanyId?.trim() || null;
}
