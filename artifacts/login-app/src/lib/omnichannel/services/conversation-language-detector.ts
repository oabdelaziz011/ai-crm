export type DetectedConversationLanguage = "ar" | "en" | "fr" | "auto";

export type ResolvedConversationLanguage = "ar" | "en";

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

function scoreFrench(text: string): number {
  const lower = text.toLowerCase();
  return FRENCH_HINTS.reduce((score, hint) => score + (lower.includes(hint) ? 1 : 0), 0);
}

function normalizeLanguageCode(value: string | null | undefined): DetectedConversationLanguage | null {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("ar") || lower === "arabic" || lower === "عربي") return "ar";
  if (lower.startsWith("en") || lower === "english") return "en";
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
  const englishLikely = /[a-z]/i.test(customerText) && frenchScore === 0;
  if (englishLikely) return "en";
  if (frenchScore >= 2) return "fr";

  return "auto";
}

/** @deprecated Use resolveConversationLanguage */
export function detectConversationLanguage(
  messages: Array<{ message_type: string; content: string }>,
): DetectedConversationLanguage {
  return detectConversationLanguageFromMessages(messages);
}

export function resolveAgentWorkspaceLanguage(i18nLanguage: string | undefined): ResolvedConversationLanguage {
  if (i18nLanguage?.toLowerCase().startsWith("ar")) return "ar";
  return "en";
}

export function resolveProfileComposerLanguage(
  preferredLanguage: string | null | undefined,
): ResolvedConversationLanguage | null {
  if (preferredLanguage?.toLowerCase().startsWith("ar")) return "ar";
  if (preferredLanguage?.toLowerCase().startsWith("en")) return "en";
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
    detected === "ar" ? "ar" : detected === "en" || detected === "fr" ? "en" : workspaceDefault;

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
      case "fr":
        return "الفرنسية";
      default:
        return "تلقائي";
    }
  }
  switch (language) {
    case "ar":
      return "Arabic";
    case "en":
      return "English";
    case "fr":
      return "French";
    default:
      return "Auto";
  }
}

export function isRtlLanguage(language: ResolvedConversationLanguage): boolean {
  return language === "ar";
}
