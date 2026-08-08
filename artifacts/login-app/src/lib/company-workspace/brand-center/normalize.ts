import {
  createDefaultBrandDocument,
  DEFAULT_BRAND_COLORS,
  emptyBrandEmailSocial,
} from "./defaults";
import type {
  CompanyBrandCenterDocument,
  CompanyBrandColors,
  CompanyBrandDocuments,
  CompanyBrandEmail,
  CompanyBrandEmailSocial,
  CompanyBrandGeneral,
  CompanyBrandLogos,
  EmailIdentityLayout,
} from "./types";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) return trimmed;
  return fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeBrandLogos(raw: unknown, mainFallback: string | null = null): CompanyBrandLogos {
  const r = readRecord(raw);
  return {
    main: asNullableUrl(r.main) ?? mainFallback,
    dark: asNullableUrl(r.dark),
    light: asNullableUrl(r.light),
    square: asNullableUrl(r.square),
    invoice: asNullableUrl(r.invoice),
    email: asNullableUrl(r.email),
    favicon: asNullableUrl(r.favicon),
  };
}

export function normalizeBrandColors(raw: unknown): CompanyBrandColors {
  const r = readRecord(raw);
  return {
    primary: asColor(r.primary, DEFAULT_BRAND_COLORS.primary),
    secondary: asColor(r.secondary, DEFAULT_BRAND_COLORS.secondary),
    accent: asColor(r.accent, DEFAULT_BRAND_COLORS.accent),
    success: asColor(r.success, DEFAULT_BRAND_COLORS.success),
    warning: asColor(r.warning, DEFAULT_BRAND_COLORS.warning),
    danger: asColor(r.danger, DEFAULT_BRAND_COLORS.danger),
    background: asColor(r.background, DEFAULT_BRAND_COLORS.background),
    surface: asColor(r.surface, DEFAULT_BRAND_COLORS.surface),
  };
}

export function normalizeBrandDocuments(raw: unknown): CompanyBrandDocuments {
  const r = readRecord(raw);
  return {
    invoiceFooter: asString(r.invoiceFooter),
    quotationFooter: asString(r.quotationFooter),
    terms: asString(r.terms),
    watermarkUrl: asNullableUrl(r.watermarkUrl),
    signatureUrl: asNullableUrl(r.signatureUrl),
  };
}

const EMAIL_LAYOUTS: EmailIdentityLayout[] = [
  "professional",
  "modern",
  "minimal",
  "executive",
];

function asEmailLayout(value: unknown): EmailIdentityLayout {
  return typeof value === "string" && EMAIL_LAYOUTS.includes(value as EmailIdentityLayout)
    ? (value as EmailIdentityLayout)
    : "professional";
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeBrandEmailSocial(raw: unknown): CompanyBrandEmailSocial {
  const r = readRecord(raw);
  const base = emptyBrandEmailSocial();
  return {
    linkedin: asString(r.linkedin, base.linkedin),
    facebook: asString(r.facebook, base.facebook),
    instagram: asString(r.instagram, base.instagram),
    x: asString(r.x, base.x),
    youtube: asString(r.youtube, base.youtube),
    tiktok: asString(r.tiktok, base.tiktok),
  };
}

export function normalizeBrandEmail(raw: unknown): CompanyBrandEmail {
  const r = readRecord(raw);
  const header = asString(r.header);
  const footer = asString(r.footer);
  const senderName = asString(r.senderName) || header;
  const legalText = asString(r.legalText) || footer;
  return {
    header: senderName,
    footer: legalText,
    replyEmail: asString(r.replyEmail),
    signature: asString(r.signature),
    senderName,
    senderDisplayName: asString(r.senderDisplayName),
    ctaEnabled: asBool(r.ctaEnabled),
    ctaText: asString(r.ctaText),
    ctaUrl: asString(r.ctaUrl),
    ctaColor: asColor(r.ctaColor, DEFAULT_BRAND_COLORS.primary),
    social: normalizeBrandEmailSocial(r.social),
    showLegalFooter: asBool(r.showLegalFooter, Boolean(legalText)),
    legalText,
    layout: asEmailLayout(r.layout),
  };
}

/** Email logo → primary logo fallback. */
export function resolveEmailLogoUrl(logos: CompanyBrandLogos): string | null {
  return logos.email || logos.main || null;
}

/**
 * Brand Center editor general block.
 * Column-backed identity (name, legal, contact) MUST come from `companyFallback`
 * (companies / billing columns) — never from branding.general JSON.
 * Only shortName / website / description may read branding.general (temporary).
 */
export function normalizeBrandGeneral(
  raw: unknown,
  companyFallback: Partial<CompanyBrandGeneral> = {},
): CompanyBrandGeneral {
  const r = readRecord(raw);
  return {
    companyName: companyFallback.companyName ?? "",
    legalName: companyFallback.legalName ?? "",
    supportEmail: companyFallback.supportEmail ?? "",
    supportPhone: companyFallback.supportPhone ?? "",
    shortName: asString(r.shortName, companyFallback.shortName ?? ""),
    website: asString(r.website, companyFallback.website ?? ""),
    description: asString(r.description, companyFallback.description ?? ""),
  };
}

/**
 * Merge companies.branding with company/billing/branch fallbacks into a full document.
 */
export function normalizeBrandCenterDocument(input: {
  brandingRaw: unknown;
  logoUrl: string | null;
  companyName: string | null;
  legalName: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  invoiceFooter: string | null;
  branchBranding: Record<string, unknown> | null;
}): CompanyBrandCenterDocument {
  const root = readRecord(input.brandingRaw);
  const hasRoot = Object.keys(root).length > 0;

  const branch = input.branchBranding ?? {};
  const branchPrimary =
    typeof branch.primaryColor === "string"
      ? branch.primaryColor
      : typeof branch.primary_color === "string"
        ? branch.primary_color
        : null;
  const branchSecondary =
    typeof branch.secondaryColor === "string"
      ? branch.secondaryColor
      : typeof branch.secondary_color === "string"
        ? branch.secondary_color
        : null;

  const logosFromBranch = {
    invoice: asNullableUrl(branch.invoiceLogoUrl),
    email: asNullableUrl(branch.emailLogoUrl),
  };

  const documentsFromBranch = {
    watermarkUrl: asNullableUrl(branch.watermarkUrl),
    invoiceFooter: input.invoiceFooter ?? "",
  };

  const columnGeneral = {
    companyName: input.companyName ?? "",
    legalName: input.legalName ?? "",
    supportEmail: input.supportEmail ?? "",
    supportPhone: input.supportPhone ?? "",
  };

  if (!hasRoot) {
    return createDefaultBrandDocument({
      general: columnGeneral,
      logos: {
        main: input.logoUrl,
        invoice: logosFromBranch.invoice,
        email: logosFromBranch.email,
      },
      colors: {
        ...(branchPrimary ? { primary: branchPrimary } : {}),
        ...(branchSecondary ? { secondary: branchSecondary } : {}),
      },
      documents: {
        invoiceFooter: documentsFromBranch.invoiceFooter,
        watermarkUrl: documentsFromBranch.watermarkUrl,
      },
      email: {
        replyEmail: input.supportEmail ?? "",
      },
    });
  }

  const baseLogos = normalizeBrandLogos(root.logos, input.logoUrl);
  const logos = {
    ...baseLogos,
    invoice: baseLogos.invoice ?? logosFromBranch.invoice,
    email: baseLogos.email ?? logosFromBranch.email,
  };

  const colors = normalizeBrandColors({
    ...readRecord(root.colors),
    ...(branchPrimary && !readRecord(root.colors).primary ? { primary: branchPrimary } : {}),
    ...(branchSecondary && !readRecord(root.colors).secondary
      ? { secondary: branchSecondary }
      : {}),
  });

  // Prefer billing footer_text when present; branding.documents is editor cache.
  const documents = normalizeBrandDocuments({
    ...readRecord(root.documents),
    invoiceFooter:
      documentsFromBranch.invoiceFooter ||
      asString(readRecord(root.documents).invoiceFooter),
    watermarkUrl:
      asNullableUrl(readRecord(root.documents).watermarkUrl) ?? documentsFromBranch.watermarkUrl,
  });

  const general = normalizeBrandGeneral(root.general, columnGeneral);

  return {
    general,
    logos,
    colors,
    documents,
    email: normalizeBrandEmail({
      ...readRecord(root.email),
      replyEmail:
        asString(readRecord(root.email).replyEmail) || input.supportEmail || "",
    }),
  };
}

/**
 * Persistable JSON for companies.branding.
 *
 * NEVER write column-backed identity here (name, legalName, supportEmail/Phone).
 * Those are saved to companies / company_billing_profiles by the RPC.
 * branding.general may only hold temporary non-column fields until the
 * "Company Identity Schema Normalization" sprint (post Company Workspace v1.0).
 */
export function toPersistedBrandingPayload(
  document: CompanyBrandCenterDocument,
): Record<string, unknown> {
  return {
    general: {
      shortName: document.general.shortName,
      website: document.general.website,
      description: document.general.description,
    },
    logos: { ...document.logos },
    colors: { ...document.colors },
    documents: { ...document.documents },
    email: {
      ...document.email,
      // Keep legacy keys mirrored for older email readers (email identity, not company identity).
      header: document.email.senderName || document.email.header,
      footer: document.email.legalText || document.email.footer,
      social: { ...document.email.social },
    },
  };
}

export function toWorkspaceBrandingSummary(document: CompanyBrandCenterDocument) {
  return {
    logoUrl: document.logos.main,
    primaryColor: document.colors.primary,
    secondaryColor: document.colors.secondary,
    invoiceLogoUrl: document.logos.invoice,
    emailLogoUrl: document.logos.email,
    watermarkUrl: document.documents.watermarkUrl,
  };
}
