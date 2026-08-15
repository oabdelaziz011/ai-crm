import type { CompanyEntitlement } from "@/lib/billing/types";

/** Sources the Billing grant dialog may set via set_company_feature_grant. */
export const BILLING_COMMERCIAL_GRANT_SOURCES = ["manual", "contract"] as const;
export type BillingCommercialGrantSource = (typeof BILLING_COMMERCIAL_GRANT_SOURCES)[number];

/** Lifecycle / system-controlled grant sources — not creatable from this UI. */
export const MANAGED_ENTITLEMENT_SOURCES = ["package", "trial", "system"] as const;

export function normalizeEntitlementSource(source: string | null | undefined): string {
  const value = (source ?? "none").trim().toLowerCase();
  return value.length > 0 ? value : "none";
}

export function isCommercialEntitlement(row: Pick<CompanyEntitlement, "is_commercial">): boolean {
  return row.is_commercial === true;
}

export function isManagedEntitlementSource(source: string | null | undefined): boolean {
  const normalized = normalizeEntitlementSource(source);
  return (MANAGED_ENTITLEMENT_SOURCES as readonly string[]).includes(normalized);
}

/** Direct revoke after confirmation — manual/contract only. */
export function canDirectRevokeEntitlementSource(source: string | null | undefined): boolean {
  const normalized = normalizeEntitlementSource(source);
  return normalized === "manual" || normalized === "contract";
}

/**
 * Commercial features eligible for a new/updated admin grant from Billing UI.
 * Excludes managed package/trial/system rows so grant cannot silently replace them.
 */
export function isGrantableCommercialEntitlement(row: CompanyEntitlement): boolean {
  if (!isCommercialEntitlement(row)) return false;
  return !isManagedEntitlementSource(row.source);
}

export function entitlementSourceToneClass(source: string | null | undefined): string {
  switch (normalizeEntitlementSource(source)) {
    case "package":
      return "border-blue-500/20 bg-blue-500/10 text-blue-300";
    case "trial":
      return "border-amber-500/20 bg-amber-500/10 text-amber-300";
    case "manual":
      return "border-violet-500/20 bg-violet-500/10 text-violet-300";
    case "contract":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "system":
      return "border-slate-500/20 bg-slate-500/10 text-slate-300";
    case "default":
      return "border-slate-500/20 bg-slate-500/10 text-slate-300";
    case "none":
      return "border-rose-500/20 bg-rose-500/10 text-rose-300";
    default:
      return "border-white/10 bg-white/5 text-muted-foreground";
  }
}
