import type { CompanyBrandCenterDocument } from "./types";

export type BrandHealthStatus =
  | "ready"
  | "required_missing"
  | "optional_missing"
  | "fallback";

export type BrandHealthSection = "logos" | "colors" | "email" | "documents" | "general";

export type BrandHealthTarget = {
  section: BrandHealthSection;
  /** Matches `data-brand-focus` on the destination control. */
  focusId: string;
};

export type BrandHealthItem = {
  id: string;
  labelKey: string;
  status: BrandHealthStatus;
  weight: number;
  target: BrandHealthTarget;
  /** i18n key under health.fallbacks.* when status is fallback. */
  fallbackKey?: string;
};

export type BrandHealthReport = {
  items: BrandHealthItem[];
  score: number;
  completed: number;
  missing: number;
  optional: number;
  fallback: number;
};

function logoStatus(
  own: string | null | undefined,
  primary: string | null | undefined,
  required: boolean,
): BrandHealthStatus {
  if (own?.trim()) return "ready";
  if (primary?.trim()) return "fallback";
  return required ? "required_missing" : "optional_missing";
}

export function computeBrandHealth(document: CompanyBrandCenterDocument): BrandHealthReport {
  const primary = document.logos.main;
  const hasEmailFooter = Boolean(
    (document.email.showLegalFooter && document.email.legalText.trim()) ||
      document.email.legalText.trim() ||
      document.email.footer.trim(),
  );
  const hasSender = Boolean(
    document.email.senderName.trim() || document.email.senderDisplayName.trim(),
  );

  const items: BrandHealthItem[] = [
    {
      id: "primaryLogo",
      labelKey: "primaryLogo",
      status: primary?.trim() ? "ready" : "required_missing",
      weight: 30,
      target: { section: "logos", focusId: "logo-main" },
    },
    {
      id: "darkLogo",
      labelKey: "darkLogo",
      status: logoStatus(document.logos.dark, primary, false),
      weight: 8,
      target: { section: "logos", focusId: "logo-dark" },
      fallbackKey: "usingPrimaryLogo",
    },
    {
      id: "invoiceLogo",
      labelKey: "invoiceLogo",
      status: logoStatus(document.logos.invoice, primary, false),
      weight: 8,
      target: { section: "logos", focusId: "logo-invoice" },
      fallbackKey: "usingPrimaryLogo",
    },
    {
      id: "emailLogo",
      labelKey: "emailLogo",
      status: logoStatus(document.logos.email, primary, false),
      weight: 8,
      target: { section: "logos", focusId: "logo-email" },
      fallbackKey: "usingPrimaryLogo",
    },
    {
      id: "primaryColor",
      labelKey: "primaryColor",
      status: document.colors.primary?.trim() ? "ready" : "required_missing",
      weight: 16,
      target: { section: "colors", focusId: "color-primary" },
    },
    {
      id: "secondaryColor",
      labelKey: "secondaryColor",
      status: document.colors.secondary?.trim() ? "ready" : "required_missing",
      weight: 12,
      target: { section: "colors", focusId: "color-secondary" },
    },
    {
      id: "emailFooter",
      labelKey: "emailFooter",
      status: hasEmailFooter ? "ready" : "optional_missing",
      weight: 10,
      target: { section: "email", focusId: "email-footer" },
    },
    {
      id: "senderIdentity",
      labelKey: "senderIdentity",
      status: hasSender ? "ready" : "optional_missing",
      weight: 8,
      target: { section: "email", focusId: "email-sender" },
    },
  ];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce((sum, item) => {
    if (item.status === "ready") return sum + item.weight;
    if (item.status === "fallback") return sum + item.weight * 0.8;
    if (item.status === "optional_missing") return sum + item.weight * 0.55;
    return sum;
  }, 0);

  return {
    items,
    score: totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0,
    completed: items.filter((i) => i.status === "ready").length,
    missing: items.filter((i) => i.status === "required_missing").length,
    optional: items.filter((i) => i.status === "optional_missing").length,
    fallback: items.filter((i) => i.status === "fallback").length,
  };
}
