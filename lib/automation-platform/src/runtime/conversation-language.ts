/**
 * Conversation language for WhatsApp automation runs.
 * Detect once from the customer's first meaningful text; keep stable for the session.
 */

export const CONVERSATION_LANGUAGES = ["ar", "en"] as const;
export type ConversationLanguage = (typeof CONVERSATION_LANGUAGES)[number];

const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Explicit language-picker button ids (optional flow UX). */
const LANGUAGE_BUTTON_IDS: Record<string, ConversationLanguage> = {
  lang_ar: "ar",
  language_ar: "ar",
  ar: "ar",
  arabic: "ar",
  lang_en: "en",
  language_en: "en",
  en: "en",
  english: "en",
};

export function normalizeConversationLanguage(value: unknown): ConversationLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "ar" || normalized === "arabic" || normalized.startsWith("ar-")) return "ar";
  if (normalized === "en" || normalized === "english" || normalized.startsWith("en-")) return "en";
  return null;
}

/**
 * Infer ar/en from customer text. Arabic script → ar; otherwise en.
 * Empty / whitespace-only → null (do not guess).
 */
export function detectConversationLanguage(text: string | null | undefined): ConversationLanguage | null {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return null;
  return ARABIC_SCRIPT_RE.test(value) ? "ar" : "en";
}

export function languageFromSelectionId(selectionId: string | null | undefined): ConversationLanguage | null {
  if (typeof selectionId !== "string") return null;
  const key = selectionId.trim().toLowerCase();
  return LANGUAGE_BUTTON_IDS[key] ?? null;
}

export function readConversationLanguage(
  variables: Record<string, unknown>,
): ConversationLanguage | null {
  const conversation = variables.conversation;
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    return null;
  }
  return normalizeConversationLanguage((conversation as { language?: unknown }).language);
}

/**
 * Set conversation.language once (or force via lang_* button).
 * Does not overwrite an existing language unless `force` is true.
 */
export function ensureConversationLanguage(
  variables: Record<string, unknown>,
  input: {
    text?: string | null;
    selectionId?: string | null;
    force?: boolean;
  },
): Record<string, unknown> {
  const current = readConversationLanguage(variables);
  const fromButton = languageFromSelectionId(input.selectionId);
  const next =
    fromButton ??
    (input.force || !current ? detectConversationLanguage(input.text) : null) ??
    current;

  if (!next || (next === current && !fromButton)) {
    return variables;
  }

  const conversation =
    variables.conversation && typeof variables.conversation === "object" && !Array.isArray(variables.conversation)
      ? { ...(variables.conversation as Record<string, unknown>) }
      : {};

  return {
    ...variables,
    conversation: {
      ...conversation,
      language: next,
    },
  };
}
