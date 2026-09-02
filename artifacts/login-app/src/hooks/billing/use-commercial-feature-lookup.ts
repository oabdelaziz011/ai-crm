import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  bindCompanyFeatureEntitlementClient,
  hasCompanyFeature,
} from "@/lib/billing/company-feature-entitlement-service";
import { BILLING_FEATURE_CODES, toBillingFeatureCode } from "@/lib/billing/feature-code-map";
import type { BillingFeatureCode } from "@/lib/billing/feature-code-map";
import { supabase } from "@/lib/supabase";

bindCompanyFeatureEntitlementClient(supabase);

export type CommercialFeatureLookup = (featureCode: string) => boolean | undefined;

/**
 * Single commercial feature map for sidebar + route shell.
 *
 * Uses `is_feature_enabled` (via hasCompanyFeature) — available to any
 * authenticated company member — NOT `get_company_entitlements`, which
 * requires billing.view / billing.view_own / subscriptions.view / admin and
 * would fail-closed hide Omnichannel for desk roles like Human Handoff Agent.
 *
 * Returns:
 * - undefined while loading / on error (fail closed for commercial routes)
 * - true/false once resolved
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

  const query = useQuery({
    queryKey: ["billing", "commercial-nav-features", companyId] as const,
    enabled: Boolean(companyId) && !isSuperAdmin,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, boolean>> => {
      if (!companyId) return new Map();
      const entries = await Promise.all(
        BILLING_FEATURE_CODES.map(async (code) => {
          const enabled = await hasCompanyFeature(companyId, code);
          return [code, enabled] as const;
        }),
      );
      return new Map(entries);
    },
  });

  const enabledByCode = query.data ?? new Map<string, boolean>();

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
