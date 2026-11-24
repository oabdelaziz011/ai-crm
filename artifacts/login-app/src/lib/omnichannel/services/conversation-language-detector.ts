export type DetectedConversationLanguage = "ar" | "en" | "de" | "fr" | "auto";

export type ResolvedConversationLanguage = "ar" | "en" | "de";

const ARABIC_RE = /[\u0600-\u06FF]/;
const FRENCH_HINTS = [
  "bonjour",
  "merci",
  "salut",
  "comment",
  "vous",
  "je ",
  " une ",
  " des ",
  " pour ",
  " avec ",
];

const GERMAN_HINTS = [
  "guten",
  "danke",
  "bitte",
  "hallo",
  "ich ",
  " und ",
  " nicht ",
  " für ",
  " mit ",
  "rechnung",
  "bestellung",
  "termin",
];

function scoreFrench(text: string): number {
  const lower = text.toLowerCase();
  return FRENCH_HINTS.reduce((score, hint) => score + (lower.includes(hint) ? 1 : 0), 0);
}

function scoreGerman(text: string): number {
  const lower = text.toLowerCase();
  const umlautBonus = /[äöüß]/i.test(text) ? 2 : 0;
  return (
    umlautBonus +
    GERMAN_HINTS.reduce((score, hint) => score + (lower.includes(hint) ? 1 : 0), 0)
  );
}

function normalizeLanguageCode(value: string | null | undefined): DetectedConversationLanguage | null {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("ar") || lower === "arabic" || lower === "عربي") return "ar";
  if (lower.startsWith("en") || lower === "english") return "en";
  if (lower.startsWith("de") || lower === "german" || lower === "deutsch") return "de";
  if (lower.startsWith("fr") || lower === "french" || lower === "français") return "fr";
  return null;
}

function readMetadataLanguage(metadata: Record<string, unknown> | null | undefined): DetectedConversationLanguage | null {
  if (!metadata) return null;
  const keys = ["language", "locale", "conversationLanguage", "conversation_language", "detectedLanguage"];
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string") {
      const normalized = normalizeLanguageCode(value);
      if (normalized) return normalized;
    }
  }
  return null;
}

export function detectConversationLanguageFromMessages(
  messages: Array<{ message_type: string; content: string }>,
): DetectedConversationLanguage {
  const customerText = messages
    .filter((message) => message.message_type === "incoming")
    .slice(-8)
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join(" ");

  if (!customerText) return "auto";
  if (ARABIC_RE.test(customerText)) return "ar";

  const frenchScore = scoreFrench(customerText);
  const germanScore = scoreGerman(customerText);
  if (germanScore >= 2 && germanScore >= frenchScore) return "de";
  if (frenchScore >= 2) return "fr";
  if (/[a-z]/i.test(customerText)) return "en";

  return "auto";
}

/** @deprecated Use resolveConversationLanguage */
export function detectConversationLanguage(
  messages: Array<{ message_type: string; content: string }>,
): DetectedConversationLanguage {
  return detectConversationLanguageFromMessages(messages);
}

export function resolveAgentWorkspaceLanguage(i18nLanguage: string | undefined): ResolvedConversationLanguage {
  const lower = i18nLanguage?.toLowerCase() ?? "";
  if (lower.startsWith("ar")) return "ar";
  if (lower.startsWith("de")) return "de";
  return "en";
}

export function resolveProfileComposerLanguage(
  preferredLanguage: string | null | undefined,
): ResolvedConversationLanguage | null {
  if (preferredLanguage?.toLowerCase().startsWith("ar")) return "ar";
  if (preferredLanguage?.toLowerCase().startsWith("en")) return "en";
  if (preferredLanguage?.toLowerCase().startsWith("de")) return "de";
  return null;
}

/**
 * Language priority for omnichannel suggested replies:
 * 1. Conversation detected language
 * 2. Agent composer language (profile preference)
 * 3. Workspace/UI language
 * 4. Company default language
 * 5. English fallback
 */
export function resolveSuggestedReplyTargetLanguage(input: {
  conversationDetected: DetectedConversationLanguage;
  agentComposerLanguage?: ResolvedConversationLanguage | null;
  workspaceLanguage: ResolvedConversationLanguage;
  companyDefaultLanguage?: ResolvedConversationLanguage | null;
}): ResolvedConversationLanguage {
  if (input.conversationDetected === "ar") return "ar";
  if (input.conversationDetected === "de") return "de";
  if (input.conversationDetected === "en" || input.conversationDetected === "fr") return "en";

  if (input.agentComposerLanguage) return input.agentComposerLanguage;
  if (input.workspaceLanguage) return input.workspaceLanguage;
  if (input.companyDefaultLanguage) return input.companyDefaultLanguage;
  return "en";
}

export function resolveConversationLanguage(input: {
  metadata?: Record<string, unknown> | null;
  messages: Array<{ message_type: string; content: string }>;
  workspaceDefault?: ResolvedConversationLanguage;
}): {
  detected: DetectedConversationLanguage;
  resolved: ResolvedConversationLanguage;
} {
  const workspaceDefault = input.workspaceDefault ?? "en";
  const fromMetadata = readMetadataLanguage(input.metadata ?? null);
  const fromMessages = detectConversationLanguageFromMessages(input.messages);

  const detected: DetectedConversationLanguage = fromMetadata ?? fromMessages;
  const resolved: ResolvedConversationLanguage =
    detected === "ar"
      ? "ar"
      : detected === "de"
        ? "de"
        : detected === "en" || detected === "fr"
          ? "en"
          : workspaceDefault;

  return { detected, resolved };
}

export function languageDisplayLabel(
  language: DetectedConversationLanguage,
  locale: ResolvedConversationLanguage = "en",
): string {
  if (locale === "ar") {
    switch (language) {
      case "ar":
        return "العربية";
      case "en":
        return "الإنجليزية";
      case "de":
        return "الألمانية";
      case "fr":
        return "الفرنسية";
      default:
        return "تلقائي";
    }
  }
  if (locale === "de") {
    switch (language) {
      case "ar":
        return "Arabisch";
      case "en":
        return "Englisch";
      case "de":
        return "Deutsch";
      case "fr":
        return "Französisch";
      default:
        return "Automatisch";
    }
  }
  switch (language) {
    case "ar":
      return "Arabic";
    case "en":
      return "English";
    case "de":
      return "German";
    case "fr":
      return "French";
    default:
      return "Auto";
  }
}

export function isRtlLanguage(language: ResolvedConversationLanguage): boolean {
  return language === "ar";
}
