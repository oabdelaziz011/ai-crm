import type {
  CompanyBrandCenterDocument,
  CompanyBrandColors,
  CompanyBrandDocuments,
  CompanyBrandEmail,
  CompanyBrandEmailSocial,
  CompanyBrandGeneral,
  CompanyBrandLogos,
  CompanyEmailSignature,
  EmailAcknowledgementConfig,
  EmailAcknowledgementTemplate,
} from "./types";
import { emptyEmailSignatureColors } from "@workspace/channel-platform";
import { VALUEOR_OR_PRIMARY } from "@/lib/brand/valueor-brand-colors";

const DEFAULT_ACK_TEMPLATES: ReadonlyArray<EmailAcknowledgementTemplate> = [
  {
    language: "en",
    enabled: true,
    body: "Thank you for contacting us. We have received your email and our team will get back to you shortly.",
  },
  {
    language: "ar",
    enabled: true,
    body: "شكرًا لتواصلك معنا. لقد استلمنا رسالتك، وسيتواصل معك أحد أعضاء فريقنا في أقرب وقت ممكن.",
  },
  {
    language: "fr",
    enabled: true,
    body: "Merci de nous avoir contactés. Nous avons bien reçu votre e-mail et notre équipe vous répondra dans les plus brefs délais.",
  },
  {
    language: "de",
    enabled: true,
    body: "Vielen Dank für Ihre Kontaktaufnahme. Wir haben Ihre E-Mail erhalten und unser Team wird sich so schnell wie möglich bei Ihnen melden.",
  },
];

export function emptyEmailAcknowledgement(): EmailAcknowledgementConfig {
  return {
    enabled: false,
    defaultLanguage: "en",
    templates: DEFAULT_ACK_TEMPLATES.map((template) => ({ ...template })),
  };
}

/**
 * Company brand defaults. `primary` / `sidebarActive` match the official
 * ValueOR lockup OR/mark color — see `valueor-brand-colors.ts`.
 * Semantic success/warning/danger stay independent of brand primary.
 */
export const DEFAULT_BRAND_COLORS: CompanyBrandColors = {
  primary: VALUEOR_OR_PRIMARY,
  secondary: "#134E4A",
  accent: "#14B8A6",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  background: "#F3F4F6",
  surface: "#FFFFFF",
  // Sidebar palette is independent from button/system primary.
  sidebar: "#134E4A",
  sidebarActive: VALUEOR_OR_PRIMARY,
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

export function emptyEmailSignature(): CompanyEmailSignature {
  return {
    name: "",
    title: "",
    email: "",
    website: "",
    colors: emptyEmailSignatureColors(),
  };
}

export function emptyBrandEmail(): CompanyBrandEmail {
  return {
    header: "",
    footer: "",
    replyEmail: "",
    signature: emptyEmailSignature(),
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
    acknowledgement: emptyEmailAcknowledgement(),
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

function inferDefaultBrandingMode(colors: CompanyBrandColors): CompanyBrandCenterDocument["brandingMode"] {
  const keys = ["primary", "secondary", "accent", "sidebar", "sidebarActive", "sidebarAccent"] as const;
  const match = keys.every(
    (key) => colors[key].trim().toLowerCase() === DEFAULT_BRAND_COLORS[key].trim().toLowerCase(),
  );
  return match ? "official" : "custom";
}

export function createDefaultBrandDocument(
  partial?: Partial<{
    brandingMode: CompanyBrandCenterDocument["brandingMode"];
    general: Partial<CompanyBrandGeneral>;
    logos: Partial<CompanyBrandLogos>;
    colors: Partial<CompanyBrandColors>;
    documents: Partial<CompanyBrandDocuments>;
    email: Partial<CompanyBrandEmail>;
  }>,
): CompanyBrandCenterDocument {
  const colors = { ...DEFAULT_BRAND_COLORS, ...partial?.colors };
  return {
    brandingMode:
      partial?.brandingMode ??
      (partial?.colors && Object.keys(partial.colors).length > 0
        ? inferDefaultBrandingMode(colors)
        : "official"),
    general: { ...emptyBrandGeneral(), ...partial?.general },
    logos: { ...emptyBrandLogos(), ...partial?.logos },
    colors,
    documents: { ...emptyBrandDocuments(), ...partial?.documents },
    email: {
      ...emptyBrandEmail(),
      ...partial?.email,
      signature: {
        ...emptyEmailSignature(),
        ...partial?.email?.signature,
        colors: {
          ...emptyEmailSignature().colors,
          ...partial?.email?.signature?.colors,
        },
      },
      social: {
        ...emptyBrandEmailSocial(),
        ...partial?.email?.social,
      },
      acknowledgement: {
        ...emptyEmailAcknowledgement(),
        ...partial?.email?.acknowledgement,
        templates:
          partial?.email?.acknowledgement?.templates?.map((template) => ({ ...template })) ??
          emptyEmailAcknowledgement().templates,
      },
    },
  };
}
