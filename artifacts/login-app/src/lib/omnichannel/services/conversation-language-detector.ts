export type DetectedConversationLanguage = "ar" | "en" | "fr" | "auto";

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

export function detectConversationLanguage(
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

export function languageDisplayLabel(language: DetectedConversationLanguage): string {
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

export function buildLanguageAwareSuggestedReply(
  baseReply: string,
  language: DetectedConversationLanguage,
): string {
  if (language === "ar") {
    return "شكرًا لتواصلك معنا. سأراجع طلبك الآن وأعود إليك في أقرب وقت.";
  }
  if (language === "fr") {
    return "Merci pour votre message. Je reviens vers vous très rapidement.";
  }
  return baseReply;
}
