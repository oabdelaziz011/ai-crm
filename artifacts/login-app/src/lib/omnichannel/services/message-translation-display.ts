import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";

const ARABIC_RE = /[\u0600-\u06FF]/;

const PHRASE_MAP_EN_TO_AR: Record<string, string> = {
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
};

const PHRASE_MAP_AR_TO_EN: Record<string, string> = {
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
};

function detectTextLanguage(text: string): ResolvedConversationLanguage | "unknown" {
  if (ARABIC_RE.test(text)) return "ar";
  if (/[a-z]/i.test(text)) return "en";
  return "unknown";
}

function translatePhraseMap(
  text: string,
  map: Record<string, string>,
): string {
  let output = text;
  for (const [source, target] of Object.entries(map)) {
    const pattern = new RegExp(source, "gi");
    output = output.replace(pattern, target);
  }
  return output;
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

export function translateMessageForDisplay(
  text: string,
  from: ResolvedConversationLanguage,
  to: ResolvedConversationLanguage,
): string {
  if (from === to) return text;
  if (from === "en" && to === "ar") {
    const translated = translatePhraseMap(text, PHRASE_MAP_EN_TO_AR);
    return translated !== text ? translated : `[ترجمة] ${text}`;
  }
  if (from === "ar" && to === "en") {
    const translated = translatePhraseMap(text, PHRASE_MAP_AR_TO_EN);
    return translated !== text ? translated : `[Translation] ${text}`;
  }
  return text;
}
