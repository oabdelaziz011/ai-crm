import { useMemo } from "react";
import { useAuth } from "@/context/auth-context";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { toBillingFeatureCode } from "@/lib/billing/feature-code-map";
import type { BillingFeatureCode } from "@/lib/billing/feature-code-map";

export type CommercialFeatureLookup = (featureCode: string) => boolean | undefined;

/**
 * Single entitlements fetch for sidebar + route shell.
 * Returns:
 * - undefined while loading / on error (fail closed for commercial routes)
 * - true/false once resolved from get_company_entitlements (uses is_feature_enabled)
 */
export function useCommercialFeatureLookup(): {
  lookup: CommercialFeatureLookup;
  isLoading: boolean;
  isError: boolean;
  isResolved: boolean;
} {
  const { company, isSuperAdmin } = useAuth();
  const companyId = company?.id ?? null;
  const approvalStatus = company?.approval_status;
  const query = useCompanyEntitlements(companyId, Boolean(companyId) && !isSuperAdmin);

  const enabledByCode = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of query.data ?? []) {
      map.set(row.feature_code, Boolean(row.enabled));
    }
    return map;
  }, [query.data]);

  const isLoading = Boolean(companyId) && !isSuperAdmin && query.isLoading;
  const isError = Boolean(companyId) && !isSuperAdmin && query.isError;
  const isResolved = isSuperAdmin || !companyId || (!isLoading && !isError);

  const lookup: CommercialFeatureLookup = (featureCode: string) => {
    if (isSuperAdmin) return true;
    if (!companyId) return false;

    // Client-side early deny for pending/rejected (server also enforces).
    if (approvalStatus === "pending" || approvalStatus === "rejected") {
      return false;
    }

    if (isLoading || isError) return undefined;

    const code = (toBillingFeatureCode(featureCode) ?? featureCode) as BillingFeatureCode | string;
    if (!enabledByCode.has(code)) {
      // Missing from catalog response → deny commercial (fail closed)
      return false;
    }
    return enabledByCode.get(code) === true;
  };

  return { lookup, isLoading, isError, isResolved };
}
