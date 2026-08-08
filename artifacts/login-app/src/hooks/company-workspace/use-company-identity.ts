import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  identityDisplayName,
  resolveCompanyIdentity,
} from "@/lib/company-workspace/company-identity/resolve-company-identity";
import type { CompanyIdentity } from "@/lib/company-workspace/company-identity/types";
import {
  companyBrandCenterKey,
  companyBrandLogosKey,
  companyIdentityKey,
  companyWorkspaceBundleKey,
} from "@/lib/company-workspace/query-keys";
import { loadCompanyIdentity } from "@/lib/company-workspace/services/company-identity-service";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";

export { companyIdentityKey };

/**
 * Single company identity resolver for staff chrome and modules.
 * Reads companies + company_billing_profiles (+ branding JSON for logos/colors/website).
 */
export function useCompanyIdentity(enabled = true) {
  const { company } = useAuth();
  const companyId = company?.id ?? null;

  const identityQuery = useQuery({
    queryKey: companyIdentityKey(companyId ?? ""),
    enabled: Boolean(enabled && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => loadCompanyIdentity(companyId!),
  });

  const identity = useMemo((): CompanyIdentity | null => {
    if (identityQuery.data) return identityQuery.data;
    return resolveCompanyIdentity({
      companyId,
      authCompany: company,
      brandDocument: null,
      bundle: null,
    });
  }, [identityQuery.data, companyId, company]);

  return {
    identity,
    companyId,
    displayName: identityDisplayName(identity),
    isLoading: Boolean(companyId) && identityQuery.isLoading && !identityQuery.data,
    isError: identityQuery.isError,
    error: identityQuery.error,
    refetch: identityQuery.refetch,
  };
}

export function invalidateCompanyIdentityCaches(
  qc: ReturnType<typeof useQueryClient>,
  companyId: string,
) {
  void qc.invalidateQueries({ queryKey: companyIdentityKey(companyId) });
  void qc.invalidateQueries({ queryKey: companyBrandCenterKey(companyId) });
  void qc.invalidateQueries({ queryKey: companyWorkspaceBundleKey(companyId) });
  void qc.invalidateQueries({ queryKey: companyBrandLogosKey(companyId) });
  void qc.invalidateQueries({ queryKey: ["company-brand-last-updated", companyId] });
  void qc.invalidateQueries({ queryKey: ["customer-portal"] });
  void qc.invalidateQueries({ queryKey: ["portal-settings"] });
}
