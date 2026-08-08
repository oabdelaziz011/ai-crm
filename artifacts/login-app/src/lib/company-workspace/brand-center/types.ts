export type BrandLogoSlot =
  | "main"
  | "dark"
  | "light"
  | "square"
  | "invoice"
  | "email"
  | "favicon";

export type BrandPreviewSurface =
  | "invoice"
  | "quotation"
  | "receipt"
  | "portal"
  | "email"
  | "login"
  | "crm"
  | "operations"
  | "sidebar"
  | "header"
  | "company"
  | "buttons"
  | "cards"
  | "charts";

export type CompanyBrandLogos = Readonly<{
  main: string | null;
  dark: string | null;
  light: string | null;
  square: string | null;
  invoice: string | null;
  email: string | null;
  favicon: string | null;
}>;

export type CompanyBrandColors = Readonly<{
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  background: string;
  surface: string;
}>;

export type CompanyBrandDocuments = Readonly<{
  invoiceFooter: string;
  quotationFooter: string;
  terms: string;
  watermarkUrl: string | null;
  signatureUrl: string | null;
}>;

export type EmailIdentityLayout = "professional" | "modern" | "minimal" | "executive";

export type CompanyBrandEmailSocial = Readonly<{
  linkedin: string;
  facebook: string;
  instagram: string;
  x: string;
  youtube: string;
  tiktok: string;
}>;

export type CompanyBrandEmail = Readonly<{
  /** @deprecated Prefer senderName — kept for backward-compatible branding JSON. */
  header: string;
  /** @deprecated Prefer legalText — kept for backward-compatible branding JSON. */
  footer: string;
  replyEmail: string;
  /** HTML from the signature rich-text editor (no raw HTML UI). */
  signature: string;
  senderName: string;
  senderDisplayName: string;
  ctaEnabled: boolean;
  ctaText: string;
  ctaUrl: string;
  ctaColor: string;
  social: CompanyBrandEmailSocial;
  showLegalFooter: boolean;
  legalText: string;
  layout: EmailIdentityLayout;
}>;

export type CompanyBrandGeneral = Readonly<{
  companyName: string;
  legalName: string;
  shortName: string;
  website: string;
  supportEmail: string;
  supportPhone: string;
  description: string;
}>;

/** Canonical Brand Center document stored in companies.branding (+ mirrored company fields). */
export type CompanyBrandCenterDocument = Readonly<{
  general: CompanyBrandGeneral;
  logos: CompanyBrandLogos;
  colors: CompanyBrandColors;
  documents: CompanyBrandDocuments;
  email: CompanyBrandEmail;
}>;

export type CompanyBrandCenterState = Readonly<{
  companyId: string;
  document: CompanyBrandCenterDocument;
  /** Storage paths for cleanup (optional; keyed by logo slot). */
  storagePaths: Partial<Record<BrandLogoSlot | "watermark" | "signature", string>>;
}>;

/** Company contact used by Email Identity Studio — never edited there. */
export type CompanyContactSnapshot = Readonly<{
  companyName: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}>;
