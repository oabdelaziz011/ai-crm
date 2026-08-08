import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import {
  companyBrandLogosKey,
  syncBrandLogosCache,
} from "@/hooks/company-workspace/use-company-brand-logos";
import { invalidateCompanyIdentityCaches } from "@/hooks/company-workspace/use-company-identity";
import { toWorkspaceBrandingSummary } from "@/lib/company-workspace/brand-center/normalize";
import type { CompanyBrandCenterDocument } from "@/lib/company-workspace/brand-center/types";
import type { CompanyIdentity } from "@/lib/company-workspace/company-identity/types";
import {
  companyBrandCenterKey,
  companyIdentityKey,
  companyWorkspaceBundleKey,
} from "@/lib/company-workspace/query-keys";
import type { CompanyWorkspaceBundle } from "@/lib/company-workspace/types";
import {
  loadCompanyBrandCenter,
  saveCompanyBrandCenter,
} from "@/lib/company-workspace/services/company-brand-center-service";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { applyBrandTheme, type BrandThemeMode } from "@/lib/theme/brand-theme-service";

function currentThemeMode(): BrandThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export { companyBrandCenterKey };

export function useCompanyBrandCenter(companyId: string | null, enabled = true) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: companyBrandCenterKey(companyId ?? ""),
    enabled: Boolean(enabled && companyId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async () => {
      const document = await loadCompanyBrandCenter(companyId!);
      // Keep identity cache aligned without a second network round-trip when possible.
      const existing = qc.getQueryData<CompanyIdentity>(companyIdentityKey(companyId!));
      if (existing) {
        qc.setQueryData<CompanyIdentity>(companyIdentityKey(companyId!), {
          ...existing,
          name: document.general.companyName || existing.name,
          shortName: document.general.shortName || null,
          description: document.general.description || null,
          website: document.general.website || null,
          contactEmail: document.general.supportEmail || existing.contactEmail,
          contactPhone: document.general.supportPhone || existing.contactPhone,
          logoUrl: document.logos.main,
          legalName: document.general.legalName || existing.legalName,
          footerText: document.documents.invoiceFooter || existing.footerText,
          colors: document.colors,
          logos: document.logos,
        });
      }
      return document;
    },
  });
}

export function useSaveCompanyBrandCenter(companyId: string | null) {
  const qc = useQueryClient();
  const { refreshAuthContext } = useAuth();

  return useMutation({
    mutationFn: (document: CompanyBrandCenterDocument) => {
      if (!companyId) throw new Error("Company id is required");
      return saveCompanyBrandCenter(companyId, document);
    },
    onMutate: async (document) => {
      if (!companyId) return {};
      await qc.cancelQueries({ queryKey: companyBrandCenterKey(companyId) });
      const previous = qc.getQueryData<CompanyBrandCenterDocument>(
        companyBrandCenterKey(companyId),
      );
      const previousLogos = qc.getQueryData(companyBrandLogosKey(companyId));
      const previousIdentity = qc.getQueryData<CompanyIdentity>(companyIdentityKey(companyId));
      qc.setQueryData(companyBrandCenterKey(companyId), document);
      syncBrandLogosCache(qc, companyId, document.logos);
      // Immediate theme apply — no reload; bridge will keep it in sync after settle.
      applyBrandTheme(document.colors, currentThemeMode());

      const optimisticIdentity: CompanyIdentity = {
        companyId,
        name: document.general.companyName || previousIdentity?.name || null,
        shortName: document.general.shortName || null,
        description: document.general.description || null,
        website: document.general.website || null,
        contactEmail: document.general.supportEmail || previousIdentity?.contactEmail || null,
        contactPhone: document.general.supportPhone || previousIdentity?.contactPhone || null,
        logoUrl: document.logos.main,
        legalName: document.general.legalName || previousIdentity?.legalName || null,
        taxId: previousIdentity?.taxId ?? null,
        commercialRegistration: null,
        address: previousIdentity?.address ?? null,
        footerText: document.documents.invoiceFooter || previousIdentity?.footerText || null,
        colors: document.colors,
        logos: document.logos,
      };
      qc.setQueryData(companyIdentityKey(companyId), optimisticIdentity);

      const bundleKey = companyWorkspaceBundleKey(companyId);
      const previousBundle = qc.getQueryData<CompanyWorkspaceBundle>(bundleKey);
      if (previousBundle) {
        qc.setQueryData<CompanyWorkspaceBundle>(bundleKey, {
          ...previousBundle,
          profile: {
            ...previousBundle.profile,
            name: document.general.companyName || previousBundle.profile.name,
            logoUrl: document.logos.main,
            legalName: document.general.legalName || previousBundle.profile.legalName,
            contactEmail:
              document.general.supportEmail || previousBundle.profile.contactEmail,
            contactPhone:
              document.general.supportPhone || previousBundle.profile.contactPhone,
            website: document.general.website || previousBundle.profile.website,
            shortName: document.general.shortName || previousBundle.profile.shortName,
            description: document.general.description || previousBundle.profile.description,
            footerText:
              document.documents.invoiceFooter || previousBundle.profile.footerText,
          },
          branding: toWorkspaceBrandingSummary(document),
        });
      }

      return { previous, previousBundle, previousLogos, previousIdentity };
    },
    onError: (err, _doc, ctx) => {
      console.error("[BrandCenter] mutation error:", err);
      if (!companyId) return;
      if (ctx?.previous) {
        qc.setQueryData(companyBrandCenterKey(companyId), ctx.previous);
        applyBrandTheme(ctx.previous.colors, currentThemeMode());
      }
      if (ctx?.previousLogos !== undefined) {
        qc.setQueryData(companyBrandLogosKey(companyId), ctx.previousLogos);
      }
      if (ctx?.previousBundle) {
        qc.setQueryData(companyWorkspaceBundleKey(companyId), ctx.previousBundle);
      }
      if (ctx?.previousIdentity) {
        qc.setQueryData(companyIdentityKey(companyId), ctx.previousIdentity);
      }
    },
    onSuccess: (document) => {
      if (!companyId) return;
      qc.setQueryData(companyBrandCenterKey(companyId), document);
      syncBrandLogosCache(qc, companyId, document.logos);
      applyBrandTheme(document.colors, currentThemeMode());
      invalidateCompanyIdentityCaches(qc, companyId);
      // Do not await — hanging auth refresh must never block success toast / mutateAsync.
      void Promise.resolve(refreshAuthContext?.()).catch((refreshErr) => {
        console.warn("[BrandCenter] auth refresh after save failed:", refreshErr);
      });
    },
  });
}
