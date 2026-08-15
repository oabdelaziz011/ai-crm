import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";
import {
  bindCompanyFeatureEntitlementClient,
  companyFeatureEntitlementService,
  getCompanyFeatureAccess,
  hasCompanyFeature,
} from "@/lib/billing/company-feature-entitlement-service";
import type { CompanyFeatureAccess } from "@/lib/billing/company-feature-access";
import { toBillingFeatureCode } from "@/lib/billing/feature-code-map";

bindCompanyFeatureEntitlementClient(supabase);

export function companyFeatureQueryKey(companyId: string | null, featureCode: string) {
  return ["billing", "company-feature", companyId, featureCode] as const;
}

/**
 * UX helper for a single company product/module entitlement.
 * Not a security boundary — server RPCs remain authoritative.
 */
export function useCompanyFeature(featureCode: string, options?: { companyId?: string | null; enabled?: boolean }) {
  const { company } = useAuth();
  const companyId = options?.companyId !== undefined ? options.companyId : (company?.id ?? null);
  const code = toBillingFeatureCode(featureCode) ?? featureCode;
  const enabled = (options?.enabled ?? true) && Boolean(companyId) && Boolean(code);

  const query = useQuery({
    queryKey: companyFeatureQueryKey(companyId, code),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CompanyFeatureAccess> => {
      if (!companyId) {
        return Object.freeze({
          featureCode: code,
          enabled: false,
          commercial: true,
          reason: "No company context",
        });
      }
      return getCompanyFeatureAccess(companyId, code);
    },
  });

  return {
    enabled: query.data?.enabled ?? false,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : query.error ? new Error(String(query.error)) : null,
    access: query.data ?? null,
    commercial: query.data?.commercial,
    source: query.data?.source,
    refetch: query.refetch,
  };
}

export function useCompanyFeatureEnabled(
  featureCode: string,
  options?: { companyId?: string | null; enabled?: boolean },
) {
  const { company } = useAuth();
  const companyId = options?.companyId !== undefined ? options.companyId : (company?.id ?? null);
  const code = toBillingFeatureCode(featureCode) ?? featureCode;

  const query = useQuery({
    queryKey: [...companyFeatureQueryKey(companyId, code), "enabled"] as const,
    enabled: (options?.enabled ?? true) && Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return false;
      return hasCompanyFeature(companyId, code);
    },
  });

  return {
    enabled: query.data ?? false,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  };
}

/**
 * Fail-closed capability gate for UI actions.
 * While entitlement is loading/unknown, `enabled` is false and `loading` is always false
 * so callers can gate on `enabled` alone.
 */
export function useCompanyCapability(
  featureCode: string,
  options?: { companyId?: string | null; enabled?: boolean },
) {
  const { enabled, loading, error } = useCompanyFeatureEnabled(featureCode, options);
  return {
    enabled: loading ? false : enabled,
    loading: false as const,
    error,
  };
}

export function useCompanyAccessState(companyId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["billing", "access-state", companyId] as const,
    enabled: enabled && Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return "expired" as const;
      return companyFeatureEntitlementService.getCompanyAccessState(companyId);
    },
  });
}
