import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { OmnichannelAiAssistModel } from "@/lib/omnichannel/types/unified-conversation";

const POSITIVE_HINTS = ["thanks", "great", "perfect", "awesome", "good"];
const NEGATIVE_HINTS = ["angry", "upset", "bad", "issue", "problem", "refund", "complaint"];

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

  return {
    suggestedReplies: buildSuggestedReplies(lastCustomerMessage?.content ?? ""),
    knowledgeSuggestions,
    sentiment,
    summary: buildConversationSummary(messages),
    escalationRecommended: sentiment === "negative" || corpus.includes("manager"),
    translationPlaceholder: "Translation will be provided by AI Runtime in a future sprint.",
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
