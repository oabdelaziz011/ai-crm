import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type { Profile } from "@/lib/types";
import type { SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";
import { formatSlaRemainingLabel } from "@/lib/omnichannel/presentation/lifecycle-timeline-presentation";
import {
  buildConversationHistory,
  computeAverageResponseTimeMinutes,
  type ConversationHistoryLabels,
} from "@/lib/omnichannel/presentation/conversation-history-builder";
import type {
  ConversationHealth,
  ConversationHealthStatus,
  ConversationInsight,
  ConversationIntelligenceSnapshot,
  ConversationMood,
  ConversationMoodId,
  ConversationRecommendation,
  CustomerJourneyStep,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";

export type ConversationInsightProviderInput = {
  conversation: UnifiedConversation | null;
  messages: UnifiedMessage[];
  lifecycleSnapshot?: LifecycleSnapshot | null;
  customerContext?: OmnichannelCustomerContext | null;
  conversationTickets?: Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  aiAssist: OmnichannelAiAssistModel;
  agentsById?: ReadonlyMap<string, { id: string; name: string }>;
  profilesByUserId?: ReadonlyMap<string, Profile>;
  labels: ConversationHistoryLabels & ConversationInsightLabels;
  smartTimeLabels: SmartTimeLabels;
  supportAgentFallback?: string;
  slaLabels?: {
    remainingMinutes: (count: number) => string;
    remainingHours: (count: number) => string;
    breached: string;
    notSet: string;
  };
};

export type ConversationInsightLabels = {
  moodHappy: string;
  moodSatisfied: string;
  moodNeutral: string;
  moodConfused: string;
  moodFrustrated: string;
  moodAngry: string;
  moodVeryAngry: string;
  moodEscalationRisk: string;
  moodRefundRisk: string;
  moodChurnRisk: string;
  moodVip: string;
  moodHighPurchaseIntent: string;
  whyRepeatedQuestion: string;
  whyNegativeWording: string;
  whySlaExceeded: string;
  whyAskedManager: string;
  whyMentionedRefund: string;
  whyThreatenedCancellation: string;
  recommendAssignBilling: string;
  recommendEscalate: string;
  recommendOfferDiscount: string;
  recommendReturnToAi: string;
  recommendCallCustomer: string;
  recommendCreateTicket: string;
  recommendRequestSupervisor: string;
  healthHealthy: string;
  healthWarning: string;
  healthCritical: string;
  journeyWhatsAppStarted: string;
  journeyCustomerCreated: string;
  journeyFirstBooking: string;
  journeyInvoice: string;
  journeyComplaint: string;
  journeyEscalation: string;
  journeyResolved: string;
  journeySurvey: string;
};

export interface ConversationInsightProvider {
  readonly providerId: string;
  buildSnapshot(input: ConversationInsightProviderInput): ConversationIntelligenceSnapshot;
}

const REFUND_PATTERN = /refund|استرجاع|money back/i;
const MANAGER_PATTERN = /manager|supervisor|مشرف|مدير/i;
const CANCEL_PATTERN = /cancel|cancellation|إلغاء/i;
const VIP_PATTERN = /vip|premium|loyal|مميز/i;
const PURCHASE_PATTERN = /buy|purchase|price|quote|شراء|سعر|عرض/i;

function countMatches(messages: UnifiedMessage[], pattern: RegExp): number {
  return messages.filter(
    (message) => message.senderType === "customer" && pattern.test(message.body),
  ).length;
}

function repeatedQuestionDetected(messages: UnifiedMessage[]): boolean {
  const customerBodies = messages
    .filter((message) => message.senderType === "customer")
    .map((message) => message.body.trim().toLowerCase())
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const body of customerBodies) {
    counts.set(body, (counts.get(body) ?? 0) + 1);
    if ((counts.get(body) ?? 0) >= 3) return true;
  }
  return false;
}

function buildMoods(input: ConversationInsightProviderInput, corpus: string): ConversationMood[] {
  const { aiAssist, labels, messages, lifecycleSnapshot } = input;
  const moods: ConversationMood[] = [];
  const baseConfidence = Math.round(Math.min(95, Math.max(45, aiAssist.confidence * 100)));

  const push = (id: ConversationMoodId, label: string, confidence: number) => {
    moods.push({ id, label, confidence: Math.min(99, Math.max(35, confidence)) });
  };

  switch (aiAssist.customerTone) {
    case "happy":
      push("happy", labels.moodHappy, baseConfidence + 10);
      push("satisfied", labels.moodSatisfied, baseConfidence);
      break;
    case "angry":
      push("angry", labels.moodAngry, baseConfidence + 15);
      push("very_angry", labels.moodVeryAngry, baseConfidence + 5);
      break;
    case "urgent":
      push("frustrated", labels.moodFrustrated, baseConfidence + 10);
      push("escalation_risk", labels.moodEscalationRisk, baseConfidence + 8);
      break;
    case "confused":
      push("confused", labels.moodConfused, baseConfidence + 8);
      break;
    default:
      push("neutral", labels.moodNeutral, baseConfidence);
  }

  if (countMatches(messages, REFUND_PATTERN) >= 2) {
    push("refund_risk", labels.moodRefundRisk, baseConfidence + 12);
  }
  if (countMatches(messages, CANCEL_PATTERN) >= 1 || aiAssist.customerTone === "angry") {
    push("churn_risk", labels.moodChurnRisk, baseConfidence + 6);
  }
  if (VIP_PATTERN.test(corpus) || (input.customerContext?.recentBookings ?? 0) >= 3) {
    push("vip", labels.moodVip, baseConfidence + 4);
  }
  if (PURCHASE_PATTERN.test(corpus)) {
    push("high_purchase_intent", labels.moodHighPurchaseIntent, baseConfidence + 7);
  }
  if (lifecycleSnapshot?.activeEscalation || aiAssist.escalationRecommended) {
    push("escalation_risk", labels.moodEscalationRisk, baseConfidence + 10);
  }

  const seen = new Set<ConversationMoodId>();
  return moods.filter((mood) => {
    if (seen.has(mood.id)) return false;
    seen.add(mood.id);
    return true;
  }).slice(0, 5);
}

function buildExplanations(input: ConversationInsightProviderInput, corpus: string): string[] {
  const { labels, messages, lifecycleSnapshot, aiAssist } = input;
  const explanations: string[] = [];

  if (repeatedQuestionDetected(messages)) explanations.push(labels.whyRepeatedQuestion);
  if (/bad|worst|unacceptable|terrible|سيء|فظيع|غاضب/i.test(corpus)) {
    explanations.push(labels.whyNegativeWording);
  }
  if (lifecycleSnapshot?.header.sla.breached) explanations.push(labels.whySlaExceeded);
  if (MANAGER_PATTERN.test(corpus)) explanations.push(labels.whyAskedManager);
  if (countMatches(messages, REFUND_PATTERN) >= 3) explanations.push(labels.whyMentionedRefund);
  if (countMatches(messages, CANCEL_PATTERN) >= 1) explanations.push(labels.whyThreatenedCancellation);

  return explanations.slice(0, 5);
}

function buildRecommendations(input: ConversationInsightProviderInput, corpus: string): ConversationRecommendation[] {
  const { labels, aiAssist, lifecycleSnapshot } = input;
  const recommendations: ConversationRecommendation[] = [];
  const base = Math.round(Math.min(92, Math.max(50, aiAssist.confidence * 100)));

  if (/invoice|payment|bill|فاتورة|دفع/i.test(corpus)) {
    recommendations.push({ id: "assign-billing", action: labels.recommendAssignBilling, confidence: base + 8 });
  }
  if (aiAssist.escalationRecommended || lifecycleSnapshot?.activeEscalation) {
    recommendations.push({ id: "escalate", action: labels.recommendEscalate, confidence: base + 12 });
  }
  if (countMatches(input.messages, REFUND_PATTERN) >= 2) {
    recommendations.push({ id: "offer-discount", action: labels.recommendOfferDiscount, confidence: base + 6 });
  }
  if (input.conversation?.handlerMode === "human" && aiAssist.customerTone === "neutral") {
    recommendations.push({ id: "return-ai", action: labels.recommendReturnToAi, confidence: base - 5 });
  }
  if (aiAssist.customerTone === "urgent" || aiAssist.customerTone === "angry") {
    recommendations.push({ id: "call-customer", action: labels.recommendCallCustomer, confidence: base + 4 });
  }
  if ((input.customerContext?.openTickets ?? 0) === 0 && /issue|problem|complaint|مشكلة|شكوى/i.test(corpus)) {
    recommendations.push({ id: "create-ticket", action: labels.recommendCreateTicket, confidence: base + 3 });
  }
  if (MANAGER_PATTERN.test(corpus)) {
    recommendations.push({ id: "request-supervisor", action: labels.recommendRequestSupervisor, confidence: base + 10 });
  }

  return recommendations.slice(0, 4);
}

function buildHealth(input: ConversationInsightProviderInput): ConversationHealth {
  const { messages, lifecycleSnapshot, slaLabels } = input;
  const customerMessages = messages.filter((message) => message.senderType === "customer" && !message.isInternalNote).length;
  const agentMessages = messages.filter((message) => message.senderType === "agent" && !message.isInternalNote).length;
  const aiResponses = messages.filter((message) => message.senderType === "assistant").length;
  const internalNotes = messages.filter((message) => message.isInternalNote).length;
  const escalations = lifecycleSnapshot?.escalationHistory.length ?? 0;
  const transfers = lifecycleSnapshot?.timeline.filter((event) => event.summary.toLowerCase().includes("transfer")).length ?? 0;

  const slaLabel = slaLabels
    ? formatSlaRemainingLabel(lifecycleSnapshot?.header.sla.dueAt, slaLabels)
    : lifecycleSnapshot?.header.sla.label ?? "—";

  let status: ConversationHealthStatus = "healthy";
  if (
    lifecycleSnapshot?.header.sla.breached
    || escalations > 0
    || input.aiAssist.customerTone === "angry"
  ) {
    status = "critical";
  } else if (
    input.aiAssist.escalationRecommended
    || input.aiAssist.customerTone === "urgent"
    || internalNotes === 0 && customerMessages > 5
  ) {
    status = "warning";
  }

  return {
    status,
    slaLabel,
    averageResponseTimeMinutes: computeAverageResponseTimeMinutes(messages),
    agentMessages,
    customerMessages,
    internalNotes,
    escalations,
    transfers,
    aiResponses,
    humanResponses: agentMessages,
  };
}

function buildJourney(
  history: ReturnType<typeof buildConversationHistory>,
  input: ConversationInsightProviderInput,
): CustomerJourneyStep[] {
  const { labels, conversation } = input;
  const chronological = [...history]
    .filter((event) => event.journeyEligible)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const labelForKind = (kind: string, target: string | null): string => {
    switch (kind) {
      case "conversation_started":
        return labels.journeyWhatsAppStarted.replace("WhatsApp", conversation?.channelLabel ?? "Channel");
      case "customer_created":
      case "customer_linked":
        return labels.journeyCustomerCreated;
      case "booking_created":
      case "booking_updated":
        return labels.journeyFirstBooking;
      case "invoice_created":
      case "invoice_paid":
        return labels.journeyInvoice;
      case "ticket_created":
        return labels.journeyComplaint;
      case "escalation":
        return labels.journeyEscalation;
      case "conversation_resolved":
      case "conversation_closed":
        return labels.journeyResolved;
      default:
        return target ?? kind;
    }
  };

  const steps: CustomerJourneyStep[] = chronological.map((event) => ({
    id: `journey-${event.id}`,
    label: labelForKind(event.kind, event.target),
    timestamp: event.timestamp,
    kind: event.kind,
    eventId: event.id,
    clickable: Boolean(event.opensCustomer360 || event.assigneeUserId || event.assigneeAiEmployeeId),
  }));

  if (steps.length > 0 && input.aiAssist.summary) {
    steps.push({
      id: "journey-survey",
      label: labels.journeySurvey,
      timestamp: input.messages.at(-1)?.timestamp ?? new Date().toISOString(),
      kind: "ai_summary",
      eventId: `ai-summary-${conversation?.id ?? "x"}`,
      clickable: false,
    });
  }

  return steps;
}

export class HeuristicConversationInsightProvider implements ConversationInsightProvider {
  readonly providerId = "heuristic-v1";

  buildSnapshot(input: ConversationInsightProviderInput): ConversationIntelligenceSnapshot {
    const history = buildConversationHistory(input);
    const corpus = input.messages
      .filter((message) => message.senderType === "customer")
      .map((message) => message.body)
      .join(" ")
      .toLowerCase();

    const language = input.aiAssist.resolvedLanguage;
    const insight: ConversationInsight = {
      providerId: this.providerId,
      language,
      direction: language === "ar" ? "rtl" : "ltr",
      moods: buildMoods(input, corpus),
      explanations: buildExplanations(input, corpus),
      recommendations: buildRecommendations(input, corpus),
      summary: input.aiAssist.summary,
    };

    return {
      insight,
      health: buildHealth(input),
      history,
      journey: buildJourney(history, input),
    };
  }
}

export const defaultConversationInsightProvider = new HeuristicConversationInsightProvider();

export function buildConversationIntelligenceSnapshot(
  input: ConversationInsightProviderInput,
  provider: ConversationInsightProvider = defaultConversationInsightProvider,
): ConversationIntelligenceSnapshot {
  return provider.buildSnapshot(input);
}
