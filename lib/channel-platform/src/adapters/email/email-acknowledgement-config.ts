/**
 * Automatic Email Acknowledgement config — stored under companies.branding.email.acknowledgement.
 * Editorial SoT remains companies.branding; this module only reads/normalizes that JSON shape.
 */

export const EMAIL_ACK_TEMPLATE_LANGUAGES = ["en", "ar", "fr", "de", "es"] as const;
export type EmailAckTemplateLanguage = (typeof EMAIL_ACK_TEMPLATE_LANGUAGES)[number];

export type EmailAcknowledgementTemplate = {
  language: string;
  enabled: boolean;
  body: string;
};

export type EmailAcknowledgementConfig = {
  enabled: boolean;
  defaultLanguage: string;
  templates: EmailAcknowledgementTemplate[];
};

export const DEFAULT_EMAIL_ACK_TEMPLATES: ReadonlyArray<EmailAcknowledgementTemplate> = [
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
  {
    language: "es",
    enabled: true,
    body: "Gracias por contactarnos. Hemos recibido su correo electrónico y nuestro equipo se pondrá en contacto con usted en breve.",
  },
];

export function createDefaultEmailAcknowledgementConfig(
  partial?: Partial<EmailAcknowledgementConfig>,
): EmailAcknowledgementConfig {
  return {
    enabled: partial?.enabled === true,
    defaultLanguage: normalizeLanguageCode(partial?.defaultLanguage) || "en",
    templates: mergeAckTemplates(partial?.templates),
  };
}

export function normalizeLanguageCode(raw: unknown): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (!value) return "";
  const primary = value.split("-")[0] ?? "";
  if (/^[a-z]{2}$/.test(primary)) return primary;
  return "";
}

function mergeAckTemplates(raw: unknown): EmailAcknowledgementTemplate[] {
  const byLang = new Map<string, EmailAcknowledgementTemplate>();
  for (const template of DEFAULT_EMAIL_ACK_TEMPLATES) {
    byLang.set(template.language, { ...template });
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const language = normalizeLanguageCode(record.language);
      if (!language) continue;
      const existing = byLang.get(language);
      byLang.set(language, {
        language,
        enabled: typeof record.enabled === "boolean" ? record.enabled : (existing?.enabled ?? true),
        body:
          typeof record.body === "string" && record.body.trim()
            ? record.body.trim()
            : (existing?.body ?? ""),
      });
    }
  }
  return Array.from(byLang.values());
}

export function normalizeEmailAcknowledgementConfig(raw: unknown): EmailAcknowledgementConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createDefaultEmailAcknowledgementConfig();
  }
  const record = raw as Record<string, unknown>;
  return createDefaultEmailAcknowledgementConfig({
    enabled: record.enabled === true,
    defaultLanguage: normalizeLanguageCode(record.defaultLanguage) || "en",
    templates: Array.isArray(record.templates) ? (record.templates as EmailAcknowledgementTemplate[]) : undefined,
  });
}

export function selectAcknowledgementTemplate(input: {
  config: EmailAcknowledgementConfig;
  detectedLanguage: string | null;
}): { template: EmailAcknowledgementTemplate; language: string; reason: string } | null {
  if (!input.config.enabled) return null;

  const detected = normalizeLanguageCode(input.detectedLanguage);
  if (detected) {
    const match = input.config.templates.find(
      (template) => template.language === detected && template.enabled && template.body.trim(),
    );
    if (match) {
      return { template: match, language: match.language, reason: "detected_language" };
    }
  }

  const fallbackLang = normalizeLanguageCode(input.config.defaultLanguage) || "en";
  const fallback = input.config.templates.find(
    (template) => template.language === fallbackLang && template.enabled && template.body.trim(),
  );
  if (fallback) {
    return {
      template: fallback,
      language: fallback.language,
      reason: detected ? "default_language_fallback" : "default_language",
    };
  }

  return null;
}

/** Stable claim key for at-most-one acknowledgement per inbound message. */
export function buildAcknowledgementClaimExternalId(inboundMessageId: string): string {
  return `valueor-ack:${inboundMessageId.trim()}`;
}
