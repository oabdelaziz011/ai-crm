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
  /** Buttons, links, rings, charts — system chrome (not sidebar). */
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  background: string;
  surface: string;
  /** Sidebar shell — independent from button/system primary. */
  sidebar: string;
  /** Active nav item / sidebar highlight. */
  sidebarActive: string;
  /** Sidebar hover / secondary chrome. */
  sidebarAccent: string;
}>;

/**
 * Explicit company branding mode.
 * - official → resolve theme from ValueOR DEFAULT_BRAND_COLORS (#0D9488 primary)
 * - custom → resolve theme from stored company colors
 * Stored custom colors are never deleted when switching to official.
 */
export type CompanyBrandingMode = "official" | "custom";

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

export type EmailAcknowledgementTemplate = Readonly<{
  language: string;
  enabled: boolean;
  body: string;
}>;

/** Automatic Email Acknowledgement — stored under companies.branding.email.acknowledgement. */
export type EmailAcknowledgementConfig = Readonly<{
  enabled: boolean;
  defaultLanguage: string;
  templates: ReadonlyArray<EmailAcknowledgementTemplate>;
}>;

/** Structured Email Signature under companies.branding.email.signature. */
export type CompanyEmailSignatureColors = Readonly<{
  name: string;
  title: string;
  email: string;
  website: string;
}>;

export type CompanyEmailSignature = Readonly<{
  name: string;
  title: string;
  email: string;
  website: string;
  colors: CompanyEmailSignatureColors;
}>;

export type CompanyBrandEmail = Readonly<{
  /** @deprecated Prefer senderName — kept for backward-compatible branding JSON. */
  header: string;
  /** @deprecated Prefer legalText — kept for backward-compatible branding JSON. */
  footer: string;
  replyEmail: string;
  /**
   * Canonical signature SoT: companies.branding.email.signature.
   * Structured fields; legacy string values are normalized on load.
   */
  signature: CompanyEmailSignature;
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
  /** Automatic receipt confirmation templates (non-AI). Default OFF. */
  acknowledgement: EmailAcknowledgementConfig;
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
  brandingMode: CompanyBrandingMode;
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
