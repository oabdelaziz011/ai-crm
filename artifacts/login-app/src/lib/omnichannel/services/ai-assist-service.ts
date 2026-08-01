import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { OmnichannelAiAssistModel } from "@/lib/omnichannel/types/unified-conversation";
import {
  buildLanguageAwareSuggestedReply,
  detectConversationLanguage,
  languageDisplayLabel,
} from "@/lib/omnichannel/services/conversation-language-detector";

const POSITIVE_HINTS = ["thanks", "great", "perfect", "awesome", "good", "merci", "شكر"];
const NEGATIVE_HINTS = ["angry", "upset", "bad", "issue", "problem", "refund", "complaint", "urgent"];

function inferIntent(lastCustomerMessage: string): string {
  if (/invoice|payment|bill|facture/i.test(lastCustomerMessage)) return "Billing";
  if (/booking|appointment|schedule|réservation/i.test(lastCustomerMessage)) return "Scheduling";
  if (/cancel|refund|complaint/i.test(lastCustomerMessage)) return "Support escalation";
  if (/price|quote|offer/i.test(lastCustomerMessage)) return "Sales inquiry";
  return "General inquiry";
}

function inferPriority(
  sentiment: OmnichannelAiAssistModel["sentiment"],
  corpus: string,
): OmnichannelAiAssistModel["priority"] {
  if (sentiment === "negative" && /urgent|asap|immediately|manager/i.test(corpus)) return "urgent";
  if (sentiment === "negative") return "high";
  if (/invoice|payment overdue/i.test(corpus)) return "high";
  return "normal";
}

export function buildAiAssistModel(
  messages: ConversationMessageRecord[],
  knowledgeSuggestions: string[] = [],
): OmnichannelAiAssistModel {
  const recentCustomerMessages = messages
    .filter((message) => message.message_type === "incoming")
    .slice(-3)
    .map((message) => message.content.toLowerCase());

  const corpus = recentCustomerMessages.join(" ");
  const sentiment = POSITIVE_HINTS.some((hint) => corpus.includes(hint))
    ? "positive"
    : NEGATIVE_HINTS.some((hint) => corpus.includes(hint))
      ? "negative"
      : corpus.length > 0
        ? "neutral"
        : "unknown";

  const lastCustomerMessage = [...messages].reverse().find((message) => message.message_type === "incoming");
  const detectedLanguage = detectConversationLanguage(messages);
  const baseSuggested = buildSuggestedReplies(lastCustomerMessage?.content ?? "");
  const suggestedReplies = baseSuggested.map((reply) =>
    buildLanguageAwareSuggestedReply(reply, detectedLanguage),
  );

  return {
    suggestedReplies,
    knowledgeSuggestions,
    sentiment,
    summary: buildConversationSummary(messages),
    intent: inferIntent(lastCustomerMessage?.content ?? ""),
    priority: inferPriority(sentiment, corpus),
    escalationRecommended: sentiment === "negative" || corpus.includes("manager"),
    translationPlaceholder: `AI replies will follow ${languageDisplayLabel(detectedLanguage)}.`,
    detectedLanguage,
    languageLabel: languageDisplayLabel(detectedLanguage),
    confidence: corpus.length > 0 ? Math.min(0.95, 0.55 + corpus.length / 200) : 0.5,
  };
}

function buildSuggestedReplies(lastCustomerMessage: string): string[] {
  if (!lastCustomerMessage.trim()) {
    return [
      "Hello! Thanks for reaching out — how can I help you today?",
      "Hi there, I'm here to assist. What do you need help with?",
    ];
  }

  if (/invoice|payment|bill/i.test(lastCustomerMessage)) {
    return [
      "I can help with billing. Could you share the invoice number?",
      "Thanks for the details — I'll review your payment status now.",
    ];
  }

  if (/booking|appointment|schedule/i.test(lastCustomerMessage)) {
    return [
      "I can help reschedule that booking. What date works best for you?",
      "Let me check availability and confirm your appointment.",
    ];
  }

  return [
    "Thanks for your message — I'm reviewing this now and will follow up shortly.",
    "I understand. Could you share a bit more detail so I can help faster?",
  ];
}

function buildConversationSummary(messages: ConversationMessageRecord[]): string {
  if (messages.length === 0) return "No messages yet.";
  const lastFive = messages.slice(-5);
  const participants = new Set(lastFive.map((message) => message.message_type));
  return `${messages.length} messages across ${participants.size} participant types. Latest activity: ${lastFive[lastFive.length - 1]?.content.slice(0, 120) ?? "n/a"}`;
}
