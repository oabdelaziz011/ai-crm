import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { normalizeBrandLogos } from "@/lib/company-workspace/brand-center/normalize";
import {
  resolveBrandLogos,
  type ResolvedBrandLogos,
} from "@/lib/company-workspace/brand-center/resolve-brand-logos";
import type { CompanyBrandCenterDocument, CompanyBrandLogos } from "@/lib/company-workspace/brand-center/types";
import {
  companyBrandCenterKey,
  companyBrandLogosKey,
} from "@/lib/company-workspace/query-keys";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";

export { companyBrandLogosKey };

async function loadCompanyBrandLogos(companyId: string): Promise<CompanyBrandLogos> {
  const { data, error } = await supabase
    .from("companies")
    .select("logo_url, branding")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const branding =
    data?.branding && typeof data.branding === "object"
      ? (data.branding as Record<string, unknown>)
      : {};
  return normalizeBrandLogos(
    branding.logos,
    data?.logo_url ? String(data.logo_url) : null,
  );
}

/** Lightweight logos query — shares updates with Brand Center cache on save. */
export function useCompanyBrandLogos(companyId: string | null, enabled = true) {
  const qc = useQueryClient();

  return useQuery({
    queryKey: companyBrandLogosKey(companyId ?? ""),
    enabled: Boolean(enabled && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: () => loadCompanyBrandLogos(companyId!),
    initialData: () => {
      if (!companyId) return undefined;
      const doc = qc.getQueryData<CompanyBrandCenterDocument>(companyBrandCenterKey(companyId));
      return doc?.logos;
    },
  });
}

export function useResolvedCompanyLogos(): ResolvedBrandLogos {
  const { company } = useAuth();
  const { data: logos } = useCompanyBrandLogos(company?.id ?? null, Boolean(company?.id));
  // Prefer Brand Center / companies.logo_url; auth is bootstrap fallback only.
  return resolveBrandLogos(logos, company?.logo_url ?? null);
}

export function syncBrandLogosCache(
  qc: ReturnType<typeof useQueryClient>,
  companyId: string,
  logos: CompanyBrandLogos,
) {
  qc.setQueryData(companyBrandLogosKey(companyId), logos);
}
