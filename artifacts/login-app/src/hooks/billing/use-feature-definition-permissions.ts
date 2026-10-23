import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  groupPermissionsByFeature,
  type FeaturePermissionRow,
} from "@/lib/billing/feature-definition-permissions";
import {
  bindCompanyFeatureEntitlementClient,
  hasCompanyFeature,
} from "@/lib/billing/company-feature-entitlement-service";
import {
  BILLING_FEATURE_CODES,
  toBillingFeatureCode,
} from "@/lib/billing/feature-code-map";
import { useUser } from "@/context/auth-context";

bindCompanyFeatureEntitlementClient(supabase);

/** Shared with nav commercial lookup so product auth and sidebar share one cache. */
export const COMPANY_FEATURE_ENABLED_MAP_QUERY_KEY = "commercial-nav-features" as const;

export function useFeatureDefinitionPermissions(enabled = true) {
  return useQuery({
    queryKey: ["billing", "feature-definition-permissions"],
    enabled,
    queryFn: async (): Promise<FeaturePermissionRow[]> => {
      const { data, error } = await supabase
        .from("feature_definition_permissions")
        .select("feature_code, permission_code, is_active")
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return (data ?? []) as FeaturePermissionRow[];
    },
    staleTime: 60_000,
  });
}

export function useFeaturePermissionMap(enabled = true) {
  const query = useFeatureDefinitionPermissions(enabled);
  const map = useMemo(
    () => groupPermissionsByFeature(query.data ?? []),
    [query.data],
  );
  return { ...query, map };
}

/**
 * Company-scoped feature enable lookup for permission availability filtering.
 *
 * Uses `is_feature_enabled` (any authenticated company member) — NOT
 * `get_company_entitlements`, which requires can_view_billing_company and would
 * fail-closed strip quotes.* / opportunities.* from desk roles that still hold
 * RBAC (breaking Quote360 preview while the send-request inbox still works).
 */
export function useCompanyFeaturePermissionGate(companyId: string | null | undefined) {
  const { isSuperAdmin } = useUser();
  const { map, isLoading: mapLoading } = useFeaturePermissionMap(Boolean(companyId) || isSuperAdmin);

  const featuresQuery = useQuery({
    queryKey: ["billing", COMPANY_FEATURE_ENABLED_MAP_QUERY_KEY, companyId ?? null] as const,
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

  const enabledFeatures = useMemo(() => {
    const set = new Set<string>();
    for (const [code, enabled] of featuresQuery.data ?? []) {
      if (enabled) set.add(code);
    }
    return set;
  }, [featuresQuery.data]);

  const isFeatureEnabled = (featureCode: string) => {
    if (isSuperAdmin) return true;
    const code = toBillingFeatureCode(featureCode) ?? featureCode;
    return enabledFeatures.has(code);
  };

  return {
    isSuperAdmin,
    featurePermissions: map,
    isFeatureEnabled,
    isLoading: Boolean(companyId) && !isSuperAdmin && (featuresQuery.isLoading || mapLoading),
    enabledFeatures,
  };
}
