import {
  DEFAULT_BRAND_COLORS,
  emptyBrandLogos,
} from "@/lib/company-workspace/brand-center/defaults";
import { normalizeBrandColors, normalizeBrandLogos } from "@/lib/company-workspace/brand-center/normalize";
import type { CompanyBrandCenterDocument } from "@/lib/company-workspace/brand-center/types";
import type { CompanyWorkspaceBundle } from "@/lib/company-workspace/types";
import type { CompanyIdentity } from "./types";

type AuthCompanyLike = {
  id: string;
  name: string | null;
  logo_url?: string | null;
} | null;

function readGeneral(brandingRaw: unknown): Record<string, unknown> {
  if (!brandingRaw || typeof brandingRaw !== "object") return {};
  const root = brandingRaw as Record<string, unknown>;
  const general = root.general;
  return general && typeof general === "object" ? (general as Record<string, unknown>) : {};
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Build identity from loaded DB rows.
 * Column-backed fields never fall back to branding.general.
 * Only shortName / website / description read from branding.general.
 */
export function companyIdentityFromRows(input: {
  companyId: string;
  name: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  brandingRaw: unknown;
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  footerText: string | null;
}): CompanyIdentity {
  const general = readGeneral(input.brandingRaw);
  const root =
    input.brandingRaw && typeof input.brandingRaw === "object"
      ? (input.brandingRaw as Record<string, unknown>)
      : {};

  return {
    companyId: input.companyId,
    name: asTrimmed(input.name),
    // Temporary non-column fields only:
    shortName: asTrimmed(general.shortName),
    description: asTrimmed(general.description),
    website: asTrimmed(general.website),
    contactEmail: asTrimmed(input.contactEmail),
    contactPhone: asTrimmed(input.contactPhone),
    logoUrl: asTrimmed(input.logoUrl),
    legalName: asTrimmed(input.legalName),
    taxId: asTrimmed(input.taxId),
    commercialRegistration: null,
    address: asTrimmed(input.address),
    footerText: asTrimmed(input.footerText),
    colors: normalizeBrandColors(root.colors),
    logos: normalizeBrandLogos(root.logos, input.logoUrl),
  };
}

/**
 * Compose identity from React Query caches.
 * Prefer workspace profile / auth (column-sourced) over Brand Center draft cache.
 * Brand document general.* for name/contact/legal is editor state already hydrated from columns —
 * used only when profile/auth are unavailable.
 */
export function resolveCompanyIdentity(input: {
  companyId: string | null;
  authCompany?: AuthCompanyLike;
  bundle?: CompanyWorkspaceBundle | null;
  brandDocument?: CompanyBrandCenterDocument | null;
}): CompanyIdentity | null {
  const companyId =
    input.companyId ||
    input.bundle?.companyId ||
    input.authCompany?.id ||
    null;
  if (!companyId) return null;

  const doc = input.brandDocument;
  const profile = input.bundle?.profile;
  const auth = input.authCompany;

  const logos = doc?.logos
    ? {
        ...emptyBrandLogos(),
        ...doc.logos,
        main: doc.logos.main ?? profile?.logoUrl ?? auth?.logo_url ?? null,
      }
    : {
        ...emptyBrandLogos(),
        main: profile?.logoUrl ?? auth?.logo_url ?? null,
      };

  return {
    companyId,
    // Column-backed: profile/auth first; brand draft only as already-hydrated cache.
    name:
      asTrimmed(profile?.name) ??
      asTrimmed(auth?.name) ??
      asTrimmed(doc?.general.companyName),
    shortName:
      asTrimmed(profile?.shortName) ?? asTrimmed(doc?.general.shortName),
    description:
      asTrimmed(profile?.description) ?? asTrimmed(doc?.general.description),
    website: asTrimmed(profile?.website) ?? asTrimmed(doc?.general.website),
    contactEmail:
      asTrimmed(profile?.contactEmail) ?? asTrimmed(doc?.general.supportEmail),
    contactPhone:
      asTrimmed(profile?.contactPhone) ?? asTrimmed(doc?.general.supportPhone),
    logoUrl:
      asTrimmed(logos.main) ??
      asTrimmed(profile?.logoUrl) ??
      asTrimmed(auth?.logo_url),
    legalName:
      asTrimmed(profile?.legalName) ?? asTrimmed(doc?.general.legalName),
    taxId: asTrimmed(profile?.taxId),
    commercialRegistration: null,
    address: asTrimmed(profile?.address),
    footerText:
      asTrimmed(profile?.footerText) ?? asTrimmed(doc?.documents.invoiceFooter),
    colors: doc?.colors ?? { ...DEFAULT_BRAND_COLORS },
    logos,
  };
}

export function identityDisplayName(
  identity: CompanyIdentity | null | undefined,
  fallback = "ValueOR",
): string {
  return identity?.shortName?.trim() || identity?.name?.trim() || fallback;
}
