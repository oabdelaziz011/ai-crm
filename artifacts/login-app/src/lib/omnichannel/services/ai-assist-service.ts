import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
} from "@/lib/omnichannel/types/unified-conversation";
import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";
import {
  languageDisplayLabel,
  resolveConversationLanguage,
  resolveSuggestedReplyTargetLanguage,
  type DetectedConversationLanguage,
  type ResolvedConversationLanguage,
} from "@/lib/omnichannel/services/conversation-language-detector";
import { buildIntelligentSuggestedReplies } from "@/lib/omnichannel/services/suggested-reply-intelligence-service";
import { buildSuggestedRepliesFromCatalog } from "@/lib/omnichannel/services/suggested-reply-catalog";
import type { CustomerTone } from "@/lib/omnichannel/types/unified-conversation";
export type RewriteMode =
  | "professional"
  | "friendly"
  | "shorter"
  | "longer"
  | "grammar"
  | "translate_en"
  | "translate_ar";

const POSITIVE_HINTS = ["thanks", "great", "perfect", "awesome", "good", "merci", "شكر", "ممتاز", "رائع"];
const ANGRY_HINTS = ["angry", "upset", "furious", "complaint", "unacceptable", "worst", "غاضب", "سيء", "فظيع", "شكوى"];
const URGENT_HINTS = ["urgent", "asap", "immediately", "now", "emergency", "عاجل", "فور", "الآن"];
const CONFUSED_HINTS = ["confused", "don't understand", "unclear", "what do you mean", "محتار", "ما فهمت", "غير واضح"];

function inferIntent(lastCustomerMessage: string, language: ResolvedConversationLanguage): string {
  const text = lastCustomerMessage.toLowerCase();
  if (/invoice|payment|bill|facture|فاتورة|دفع/i.test(text)) {
    return language === "ar" ? "استفسار فواتير" : "Billing";
  }
  if (/booking|appointment|schedule|réservation|موعد|حجز/i.test(text)) {
    return language === "ar" ? "جدولة" : "Scheduling";
  }
  if (/cancel|refund|complaint|استرجاع|إلغاء|شكوى/i.test(text)) {
    return language === "ar" ? "تصعيد دعم" : "Support escalation";
  }
  if (/price|quote|offer|سعر|عرض/i.test(text)) {
    return language === "ar" ? "استفسار مبيعات" : "Sales inquiry";
  }
  return language === "ar" ? "استفسار عام" : "General inquiry";
}

function inferCustomerTone(corpus: string): CustomerTone {
  const lower = corpus.toLowerCase();
  if (URGENT_HINTS.some((hint) => lower.includes(hint))) return "urgent";
  if (ANGRY_HINTS.some((hint) => lower.includes(hint))) return "angry";
  if (CONFUSED_HINTS.some((hint) => lower.includes(hint) || corpus.includes("?"))) return "confused";
  if (POSITIVE_HINTS.some((hint) => lower.includes(hint))) return "happy";
  if (corpus.length > 0) return "neutral";
  return "neutral";
}

function inferSentiment(tone: CustomerTone): OmnichannelAiAssistModel["sentiment"] {
  if (tone === "happy") return "positive";
  if (tone === "angry" || tone === "urgent") return "negative";
  return "neutral";
}

function inferPriority(tone: CustomerTone, corpus: string): OmnichannelAiAssistModel["priority"] {
  if (tone === "urgent" || (tone === "angry" && /manager|supervisor|مشرف/i.test(corpus))) return "urgent";
  if (tone === "angry") return "high";
  if (/invoice|payment overdue|فاتورة متأخرة/i.test(corpus)) return "high";
  return "normal";
}

function buildConversationSummary(
  messages: ConversationMessageRecord[],
  language: ResolvedConversationLanguage,
): string {
  if (messages.length === 0) {
    return language === "ar" ? "لا توجد رسائل بعد." : "No messages yet.";
  }

  const customerMessages = messages.filter((message) => message.message_type === "incoming");
  const agentMessages = messages.filter(
    (message) => message.message_type === "outgoing" || message.message_type === "internal_note",
  );
  const lastCustomer = customerMessages.at(-1)?.content.slice(0, 100) ?? "";
  const lastAgent = agentMessages.at(-1)?.content.slice(0, 100) ?? "";

  if (language === "ar") {
    return [
      `ملخص المحادثة: ${messages.length} رسالة.`,
      customerMessages.length > 0 ? `آخر رسالة من العميل: ${lastCustomer || "—"}` : null,
      agentMessages.length > 0 ? `آخر رد من الفريق: ${lastAgent || "—"}` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Conversation summary: ${messages.length} messages.`,
    customerMessages.length > 0 ? `Latest customer message: ${lastCustomer || "—"}` : null,
    agentMessages.length > 0 ? `Latest team reply: ${lastAgent || "—"}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildAiAssistModel(
  messages: ConversationMessageRecord[],
  knowledgeSuggestions: string[] = [],
  options?: {
    metadata?: Record<string, unknown> | null;
    /** @deprecated Use workspaceLanguage */
    workspaceDefault?: ResolvedConversationLanguage;
    workspaceLanguage?: ResolvedConversationLanguage;
    agentComposerLanguage?: ResolvedConversationLanguage | null;
    companyDefaultLanguage?: ResolvedConversationLanguage | null;
    labelLocale?: ResolvedConversationLanguage;
    lifecycleState?: LifecycleState;
    customerContext?: OmnichannelCustomerContext | null;
  },
): OmnichannelAiAssistModel {
  const recentCustomerMessages = messages
    .filter((message) => message.message_type === "incoming")
    .slice(-3)
    .map((message) => message.content.toLowerCase());

  const corpus = recentCustomerMessages.join(" ");
  const workspaceLanguage =
    options?.workspaceLanguage
    ?? options?.workspaceDefault
    ?? "en";
  const { detected, resolved } = resolveConversationLanguage({
    metadata: options?.metadata,
    messages,
    workspaceDefault: workspaceLanguage,
  });
  const labelLocale = options?.labelLocale ?? resolved;
  const targetLanguage = resolveSuggestedReplyTargetLanguage({
    conversationDetected: detected,
    agentComposerLanguage: options?.agentComposerLanguage,
    workspaceLanguage,
    companyDefaultLanguage: options?.companyDefaultLanguage,
  });
  const customerTone = inferCustomerTone(corpus);
  const sentiment = inferSentiment(customerTone);

  const lastCustomerMessage = [...messages].reverse().find((message) => message.message_type === "incoming");
  const lastCustomerText = lastCustomerMessage?.content ?? "";
  const intent = inferIntent(lastCustomerText, targetLanguage);
  const summary = buildConversationSummary(messages, resolved);
  const mergedKnowledge = [
    ...knowledgeSuggestions,
    ...(options?.customerContext?.knowledgeSuggestions ?? []),
  ].filter(Boolean);

  const suggestedReplies: IntelligentSuggestedReply[] = buildIntelligentSuggestedReplies({
    messages,
    summary,
    customerTone,
    targetLanguage,
    lifecycleState: options?.lifecycleState,
    knowledgeSuggestions: mergedKnowledge,
    customerContext: options?.customerContext,
  });

  const translationNote =
    labelLocale === "ar"
      ? `ستتبع ردود الذكاء الاصطناعي لغة ${languageDisplayLabel(detected, "ar")}.`
      : `AI replies will follow ${languageDisplayLabel(detected, "en")}.`;

  return {
    suggestedReplies,
    knowledgeSuggestions,
    sentiment,
    customerTone,
    summary,
    intent,
    priority: inferPriority(customerTone, corpus),
    escalationRecommended: customerTone === "angry" || customerTone === "urgent" || corpus.includes("manager"),
    translationPlaceholder: translationNote,
    detectedLanguage: detected,
    resolvedLanguage: resolved,
    suggestedReplyTargetLanguage: targetLanguage,
    targetLanguage,
    languageLabel: languageDisplayLabel(detected, labelLocale),
    confidence: corpus.length > 0 ? Math.min(0.95, 0.55 + corpus.length / 200) : 0.5,
  };
}

export function rewriteDraftText(
  text: string,
  mode: RewriteMode = "grammar",
  language: ResolvedConversationLanguage = "en",
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  if (mode === "translate_ar") return translateDraftToArabic(trimmed);
  if (mode === "translate_en") return translateDraftToEnglish(trimmed);
  if (mode === "shorter") {
    const shortened = trimmed
      .replace(/\b(just|maybe|kind of|sort of|i think|please note that|for your information)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return shortened.length >= 8 ? shortened : trimmed;
  }
  if (mode === "longer") {
    if (language === "ar") {
      return trimmed.endsWith(".") || trimmed.endsWith("؟")
        ? `${trimmed} سأتابع معك بأي تحديثات.`
        : `${trimmed}. سأتابع معك بأي تحديثات.`;
    }
    return trimmed.endsWith(".")
      ? `${trimmed} I'll keep you posted with any updates.`
      : `${trimmed}. I'll keep you posted with any updates.`;
  }
  if (mode === "professional") {
    if (language === "ar") {
      return trimmed.startsWith("تحية") ? trimmed : `تحية طيبة، ${trimmed}`;
    }
    return /^dear|hello|hi|thank you/i.test(trimmed) ? trimmed : `Dear customer, ${trimmed}`;
  }
  if (mode === "friendly") {
    if (language === "ar") {
      return trimmed.startsWith("مرحب") ? trimmed : `مرحباً! ${trimmed}`;
    }
    return /^hi|hello|hey|thank you/i.test(trimmed) ? trimmed : `Hi there! ${trimmed}`;
  }

  const withoutFillers = trimmed
    .replace(/\b(just|maybe|kind of|sort of|i think)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/[.!?؟]$/.test(withoutFillers)) return withoutFillers;
  return `${withoutFillers}.`;
}

export function improveToneDraftText(text: string, language: ResolvedConversationLanguage = "en"): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (language === "ar") {
    if (/^(شكر|مرحب|أهلا)/.test(trimmed)) return trimmed;
    return `شكراً لتواصلك. ${trimmed}`;
  }
  const polite = trimmed.replace(/\b(can't|won't|don't)\b/gi, (match) => {
    if (match.toLowerCase() === "can't") return "cannot";
    if (match.toLowerCase() === "won't") return "will not";
    return "do not";
  });
  if (/^thanks|thank you|hello|hi|dear/i.test(polite)) return polite;
  return `Thank you for your message. ${polite.charAt(0).toUpperCase()}${polite.slice(1)}`;
}

function translateDraftToArabic(text: string): string {
  if (/[\u0600-\u06FF]/.test(text)) return text;
  return `[AR] ${text}`;
}

function translateDraftToEnglish(text: string): string {
  if (!/[\u0600-\u06FF]/.test(text)) return text;
  return `[EN] ${text}`;
}

export function buildLanguageAwareSuggestedReply(
  baseReply: string,
  language: DetectedConversationLanguage,
  tone: CustomerTone = "neutral",
): string {
  const targetLanguage: ResolvedConversationLanguage = language === "ar" ? "ar" : "en";
  const localized = buildSuggestedRepliesFromCatalog({
    targetLanguage,
    lastCustomerMessage: baseReply,
    tone,
  });
  return localized[0] ?? baseReply;
}

export { buildSuggestedReplyGenerationPrompt } from "@/lib/omnichannel/services/suggested-reply-catalog";
export { buildIntelligentSuggestedReplies, classifySuggestedReplyIntent } from "@/lib/omnichannel/services/suggested-reply-intelligence-service";
