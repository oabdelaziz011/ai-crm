import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";

const ARABIC_RE = /[\u0600-\u06FF]/;

/** Internal placeholders — must never appear in composer drafts. */
export const INTERNAL_TRANSLATION_MARKERS = [
  "[Translation]",
  "[ترجمة]",
  "[EN]",
  "[AR]",
] as const;

const PHRASE_MAP_AR_TO_EN: Record<string, string> = {
  "أفهم استفسارك، اسمح لي أتحقق من ذلك.": "I understand your question. Let me check that for you.",
  "أفهم استفسارك": "I understand your question",
  "اسمح لي أتحقق من ذلك": "Let me check that for you",
  "اسمح لي أتحقق": "Let me check",
  مرحبا: "Hello",
  أهلا: "Hello",
  شكرا: "Thank you",
  فاتورة: "Invoice",
  طلب: "Order",
  استرجاع: "Refund",
  موعد: "Appointment",
  إلغاء: "Cancellation",
  مشكلة: "Issue",
  عاجل: "Urgent",
  مساعدة: "Help",
  أفهم: "I understand",
  استفسارك: "your question",
  أتحقق: "check",
};

const PHRASE_MAP_EN_TO_AR: Record<string, string> = {
  "i understand your question. let me check that for you.":
    "أفهم استفسارك، اسمح لي أتحقق من ذلك.",
  "i understand your question": "أفهم استفسارك",
  "let me check that for you": "اسمح لي أتحقق من ذلك",
  "let me check": "اسمح لي أتحقق",
  hello: "مرحباً",
  hi: "أهلاً",
  thanks: "شكراً",
  "thank you": "شكراً لك",
  refund: "استرجاع",
  invoice: "فاتورة",
  order: "طلب",
  appointment: "موعد",
  cancel: "إلغاء",
  help: "مساعدة",
  urgent: "عاجل",
  problem: "مشكلة",
  issue: "مشكلة",
  "i understand": "أفهم",
};

function detectTextLanguage(text: string): ResolvedConversationLanguage | "unknown" {
  if (ARABIC_RE.test(text)) return "ar";
  if (/[a-z]/i.test(text)) return "en";
  return "unknown";
}

function translatePhraseMap(text: string, map: Record<string, string>): string {
  let output = text;
  for (const [source, target] of Object.entries(map)) {
    const pattern = new RegExp(source, "gi");
    output = output.replace(pattern, target);
  }
  return output;
}

/**
 * Remove known internal translation wrappers without altering legitimate customer text.
 * Handles repeated prefixes like `[Translation] [Translation] …`.
 */
export function stripInternalTranslationMarkers(text: string): string {
  let output = text;
  for (const marker of INTERNAL_TRANSLATION_MARKERS) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    output = output.replace(new RegExp(`(?:\\s*${escaped})+`, "gi"), " ");
  }
  return output.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

export function shouldOfferMessageTranslation(
  messageText: string,
  _conversationLanguage: ResolvedConversationLanguage,
  agentLanguage: ResolvedConversationLanguage,
): boolean {
  const messageLang = detectTextLanguage(messageText);
  if (messageLang === "unknown") return false;
  return messageLang !== agentLanguage;
}

export function resolveMessageSourceLanguage(
  text: string,
): ResolvedConversationLanguage | "unknown" {
  return detectTextLanguage(text);
}

/**
 * Display-path phrase-map translation.
 * Never injects `[Translation]` / `[ترجمة]` markers (those caused recursive draft corruption).
 * If no phrase matches, returns the original text unchanged.
 */
export function translateMessageForDisplay(
  text: string,
  from: ResolvedConversationLanguage,
  to: ResolvedConversationLanguage,
): string {
  const cleaned = stripInternalTranslationMarkers(text);
  if (from === to) return cleaned;
  if (from === "en" && to === "ar") {
    return translatePhraseMap(cleaned, PHRASE_MAP_EN_TO_AR);
  }
  if (from === "ar" && to === "en") {
    return translatePhraseMap(cleaned, PHRASE_MAP_AR_TO_EN);
  }
  return cleaned;
}
