import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  groupPermissionsByFeature,
  type FeaturePermissionRow,
} from "@/lib/billing/feature-definition-permissions";
import { useCompanyEntitlements } from "@/hooks/billing/use-company-entitlements";
import { useUser } from "@/context/auth-context";

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

/** Company-scoped feature enable lookup for permission availability filtering. */
export function useCompanyFeaturePermissionGate(companyId: string | null | undefined) {
  const { isSuperAdmin } = useUser();
  const entitlements = useCompanyEntitlements(companyId ?? null, Boolean(companyId));
  const { map, isLoading: mapLoading } = useFeaturePermissionMap(Boolean(companyId) || isSuperAdmin);

  const enabledFeatures = useMemo(() => {
    const set = new Set<string>();
    for (const row of entitlements.data ?? []) {
      if (row.enabled && row.feature_code) set.add(row.feature_code);
    }
    return set;
  }, [entitlements.data]);

  const isFeatureEnabled = (featureCode: string) => enabledFeatures.has(featureCode);

  return {
    isSuperAdmin,
    featurePermissions: map,
    isFeatureEnabled,
    isLoading: entitlements.isLoading || mapLoading,
    enabledFeatures,
  };
}
