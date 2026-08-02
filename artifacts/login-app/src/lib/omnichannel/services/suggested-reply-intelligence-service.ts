import type { ConversationMessageRecord } from "@workspace/ai-conversation";
import type { LifecycleState } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import enCommon from "@/locales/en/common.json";
import arCommon from "@/locales/ar/common.json";
import type {
  CustomerTone,
  OmnichannelCustomerContext,
} from "@/lib/omnichannel/types/unified-conversation";
import type { ResolvedConversationLanguage } from "@/lib/omnichannel/services/conversation-language-detector";
import { getSuggestedReplySamples } from "@/lib/omnichannel/services/suggested-reply-catalog";
import type {
  IntelligentSuggestedReply,
  SuggestedReplyCatalogBucket,
  SuggestedReplyIntentKey,
  SuggestedReplySignal,
} from "@/lib/omnichannel/types/suggested-reply-types";

export type SuggestedReplyIntelligenceInput = {
  messages: ConversationMessageRecord[];
  summary: string;
  customerTone: CustomerTone;
  targetLanguage: ResolvedConversationLanguage;
  lifecycleState?: LifecycleState;
  knowledgeSuggestions?: string[];
  customerContext?: OmnichannelCustomerContext | null;
};

type IntentClassification = {
  key: SuggestedReplyIntentKey;
  label: string;
  matchStrength: number;
  signals: SuggestedReplySignal[];
};

type ExplainTemplates = {
  reasonTemplate: string;
  journey: Record<string, string>;
  mood: Record<CustomerTone, string>;
  signals: Record<SuggestedReplySignal, string>;
};

function explainTemplates(language: ResolvedConversationLanguage): ExplainTemplates {
  const copy = language === "ar"
    ? arCommon.omnichannel.suggestedReplies.explain
    : enCommon.omnichannel.suggestedReplies.explain;
  return copy as ExplainTemplates;
}

function intentLabels(language: ResolvedConversationLanguage): Record<SuggestedReplyIntentKey, string> {
  const copy = language === "ar"
    ? arCommon.omnichannel.suggestedReplies.intents
    : enCommon.omnichannel.suggestedReplies.intents;
  return copy as Record<SuggestedReplyIntentKey, string>;
}

function recentCustomerCorpus(messages: ConversationMessageRecord[]): string {
  return messages
    .filter((message) => message.message_type === "incoming")
    .slice(-5)
    .map((message) => message.content)
    .join(" ")
    .toLowerCase();
}

function lastCustomerMessage(messages: ConversationMessageRecord[]): string {
  return [...messages].reverse().find((message) => message.message_type === "incoming")?.content ?? "";
}

function resolveJourneyStage(
  lifecycleState: LifecycleState | undefined,
  language: ResolvedConversationLanguage,
): { key: string; label: string; signal: SuggestedReplySignal | null } {
  const templates = explainTemplates(language).journey;
  if (!lifecycleState) {
    return { key: "unknown", label: templates.unknown ?? "—", signal: null };
  }
  if (lifecycleState === "NEW" || lifecycleState === "AI_HANDLING") {
    return { key: "discovery", label: templates.discovery, signal: "journey_stage" };
  }
  if (lifecycleState === "ESCALATED") {
    return { key: "escalation", label: templates.escalation, signal: "journey_stage" };
  }
  if (lifecycleState === "PENDING_CUSTOMER" || lifecycleState === "WAITING_QUEUE") {
    return { key: "waiting", label: templates.waiting, signal: "journey_stage" };
  }
  if (lifecycleState === "RESOLVED" || lifecycleState === "CLOSED") {
    return { key: "resolution", label: templates.resolution, signal: "journey_stage" };
  }
  return { key: "active", label: templates.active, signal: "journey_stage" };
}

export function classifySuggestedReplyIntent(input: {
  lastCustomerMessage: string;
  corpus: string;
  targetLanguage: ResolvedConversationLanguage;
  customerTone: CustomerTone;
  customerContext?: OmnichannelCustomerContext | null;
}): IntentClassification {
  const text = input.lastCustomerMessage.trim();
  const lower = text.toLowerCase();
  const labels = intentLabels(input.targetLanguage);
  const signals: SuggestedReplySignal[] = [];

  if (input.corpus.trim()) signals.push("last_messages");

  const crm = input.customerContext;
  if (crm) {
    signals.push("customer_360");
    if (crm.outstandingInvoices > 0 || crm.recentBookings > 0 || crm.openTickets > 0) {
      signals.push("crm_attributes");
    }
  }

  if (!text) {
    return { key: "greeting", label: labels.greeting, matchStrength: 0.72, signals };
  }

  let key: SuggestedReplyIntentKey = "general";
  let matchStrength = 0.55;

  if (/invoice|payment|bill|facture|فاتورة|دفع/i.test(lower)) {
    key = "billing";
    matchStrength = 0.92;
    if (crm && crm.outstandingInvoices > 0) matchStrength = 0.97;
  } else if (/booking|appointment|schedule|réservation|موعد|حجز/i.test(lower)) {
    key = "scheduling";
    matchStrength = 0.9;
    if (crm && crm.recentBookings > 0) matchStrength = 0.95;
  } else if (/cancel|refund|complaint|استرجاع|إلغاء|شكوى/i.test(lower)) {
    key = "support_escalation";
    matchStrength = 0.93;
    if (crm && crm.openTickets > 0) matchStrength = 0.97;
  } else if (/price|quote|offer|سعر|عرض/i.test(lower)) {
    key = "sales";
    matchStrength = 0.88;
  } else if (crm?.outstandingInvoices && crm.outstandingInvoices > 0 && /pay|due|overdue|متأخر|استحقاق/i.test(lower)) {
    key = "billing";
    matchStrength = 0.84;
  } else if (crm?.openTickets && crm.openTickets > 0) {
    key = "support_escalation";
    matchStrength = 0.78;
  }

  signals.push("intent_classification");
  return { key, label: labels[key], matchStrength, signals };
}

function catalogBucketForIntent(
  intent: SuggestedReplyIntentKey,
  tone: CustomerTone,
): SuggestedReplyCatalogBucket {
  if (intent === "greeting") return "empty";
  if (intent === "billing") {
    return tone === "angry" || tone === "urgent" ? "billingUrgent" : "billingNeutral";
  }
  if (intent === "scheduling") return "scheduling";
  if (intent === "support_escalation") {
    return tone === "angry" ? "refundAngry" : "refundNeutral";
  }
  if (intent === "sales") return "salesNeutral";
  if (tone === "confused") return "confused";
  if (tone === "happy") return "happy";
  return "general";
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreReply(input: {
  intentMatch: number;
  mood: CustomerTone;
  tone: CustomerTone;
  hasSummary: boolean;
  hasKnowledge: boolean;
  hasCrm: boolean;
  hasJourney: boolean;
  replyIndex: number;
}): { confidence: number; signals: SuggestedReplySignal[] } {
  const signals: SuggestedReplySignal[] = ["intent_classification", "customer_mood"];
  let score = input.intentMatch * 42;

  if (input.hasSummary) {
    score += 12;
    signals.push("conversation_summary");
  }
  signals.push("last_messages");

  if (input.mood === input.tone) {
    score += 10;
  } else if (
    (input.mood === "angry" || input.mood === "urgent")
    && (input.tone === "angry" || input.tone === "urgent")
  ) {
    score += 8;
  }

  if (input.hasKnowledge) {
    score += 10;
    signals.push("knowledge_retrieval");
  }
  if (input.hasCrm) {
    score += 8;
    signals.push("crm_attributes", "customer_360");
  }
  if (input.hasJourney) {
    score += 6;
    signals.push("journey_stage");
  }

  score += Math.max(0, 8 - input.replyIndex * 3);
  return { confidence: clampConfidence(score), signals: [...new Set(signals)] };
}

function buildExplainReason(input: {
  language: ResolvedConversationLanguage;
  intentLabel: string;
  mood: CustomerTone;
  journeyLabel: string;
  signalCount: number;
}): string {
  const template = explainTemplates(input.language).reasonTemplate;
  const moodLabel = explainTemplates(input.language).mood[input.mood];
  return template
    .replace(/\{\{intent\}\}/g, input.intentLabel)
    .replace(/\{\{mood\}\}/g, moodLabel)
    .replace(/\{\{journey\}\}/g, input.journeyLabel)
    .replace(/\{\{signalCount\}\}/g, String(input.signalCount));
}

export function buildIntelligentSuggestedReplies(
  input: SuggestedReplyIntelligenceInput,
): IntelligentSuggestedReply[] {
  const corpus = recentCustomerCorpus(input.messages);
  const lastMessage = lastCustomerMessage(input.messages);
  const knowledgeSuggestions = input.knowledgeSuggestions ?? [];
  const hasKnowledge = knowledgeSuggestions.length > 0;
  const hasCrm = Boolean(
    input.customerContext
    && (
      input.customerContext.outstandingInvoices > 0
      || input.customerContext.recentBookings > 0
      || input.customerContext.openTickets > 0
    ),
  );
  const hasSummary = Boolean(input.summary.trim());
  const journey = resolveJourneyStage(input.lifecycleState, input.targetLanguage);

  const classification = classifySuggestedReplyIntent({
    lastCustomerMessage: lastMessage,
    corpus,
    targetLanguage: input.targetLanguage,
    customerTone: input.customerTone,
    customerContext: input.customerContext,
  });

  const bucket = catalogBucketForIntent(classification.key, input.customerTone);
  const samples = getSuggestedReplySamples(input.targetLanguage, bucket).slice(0, 2);

  const replies = samples.map((text, index) => {
    const scoring = scoreReply({
      intentMatch: classification.matchStrength,
      mood: input.customerTone,
      tone: input.customerTone,
      hasSummary,
      hasKnowledge,
      hasCrm,
      hasJourney: journey.signal !== null,
      replyIndex: index,
    });

    const signalsUsed = [...new Set([...classification.signals, ...scoring.signals])];
    if (hasKnowledge) signalsUsed.push("knowledge_retrieval");

    const knowledgeSource = hasKnowledge ? knowledgeSuggestions[0] ?? null : null;

    const explanation = {
      reason: buildExplainReason({
        language: input.targetLanguage,
        intentLabel: classification.label,
        mood: input.customerTone,
        journeyLabel: journey.label,
        signalCount: signalsUsed.length,
      }),
      signalsUsed,
      intent: classification.label,
      mood: input.customerTone,
      journey: journey.label,
      knowledgeSource,
      confidence: scoring.confidence,
    };

    return {
      id: `${classification.key}-${bucket}-${index}`,
      text,
      confidence: scoring.confidence,
      intent: classification.key,
      explanation,
    } satisfies IntelligentSuggestedReply;
  });

  return replies.sort((left, right) => right.confidence - left.confidence);
}

export { buildSuggestedReplyGenerationPrompt } from "@/lib/omnichannel/services/suggested-reply-catalog";
