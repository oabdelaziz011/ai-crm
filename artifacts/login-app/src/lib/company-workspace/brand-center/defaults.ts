import type {
  CompanyBrandCenterDocument,
  CompanyBrandColors,
  CompanyBrandDocuments,
  CompanyBrandEmail,
  CompanyBrandEmailSocial,
  CompanyBrandGeneral,
  CompanyBrandLogos,
} from "./types";

export const DEFAULT_BRAND_COLORS: CompanyBrandColors = {
  primary: "#0D9488",
  secondary: "#134E4A",
  accent: "#14B8A6",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  background: "#F3F4F6",
  surface: "#FFFFFF",
  // Sidebar palette is independent from button/system primary.
  sidebar: "#134E4A",
  sidebarActive: "#0D9488",
  sidebarAccent: "#0F766E",
};

export function emptyBrandLogos(): CompanyBrandLogos {
  return {
    main: null,
    dark: null,
    light: null,
    square: null,
    invoice: null,
    email: null,
    favicon: null,
  };
}

export function emptyBrandDocuments(): CompanyBrandDocuments {
  return {
    invoiceFooter: "",
    quotationFooter: "",
    terms: "",
    watermarkUrl: null,
    signatureUrl: null,
  };
}

export function emptyBrandEmailSocial(): CompanyBrandEmailSocial {
  return {
    linkedin: "",
    facebook: "",
    instagram: "",
    x: "",
    youtube: "",
    tiktok: "",
  };
}

export function emptyBrandEmail(): CompanyBrandEmail {
  return {
    header: "",
    footer: "",
    replyEmail: "",
    signature: "",
    senderName: "",
    senderDisplayName: "",
    ctaEnabled: false,
    ctaText: "",
    ctaUrl: "",
    ctaColor: DEFAULT_BRAND_COLORS.primary,
    social: emptyBrandEmailSocial(),
    showLegalFooter: false,
    legalText: "",
    layout: "professional",
  };
}

export function emptyBrandGeneral(): CompanyBrandGeneral {
  return {
    companyName: "",
    legalName: "",
    shortName: "",
    website: "",
    supportEmail: "",
    supportPhone: "",
    description: "",
  };
}

export function createDefaultBrandDocument(
  partial?: Partial<{
    general: Partial<CompanyBrandGeneral>;
    logos: Partial<CompanyBrandLogos>;
    colors: Partial<CompanyBrandColors>;
    documents: Partial<CompanyBrandDocuments>;
    email: Partial<CompanyBrandEmail>;
  }>,
): CompanyBrandCenterDocument {
  return {
    general: { ...emptyBrandGeneral(), ...partial?.general },
    logos: { ...emptyBrandLogos(), ...partial?.logos },
    colors: { ...DEFAULT_BRAND_COLORS, ...partial?.colors },
    documents: { ...emptyBrandDocuments(), ...partial?.documents },
    email: {
      ...emptyBrandEmail(),
      ...partial?.email,
      social: {
        ...emptyBrandEmailSocial(),
        ...partial?.email?.social,
      },
    },
  };
}
