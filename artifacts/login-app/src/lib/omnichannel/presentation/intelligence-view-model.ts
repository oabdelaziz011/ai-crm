import type {
  ConversationHealth,
  ConversationHistoryEventKind,
  ConversationIntelligenceSnapshot,
  ConversationMood,
  ConversationMoodId,
  ConversationRecommendation,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type {
  OmnichannelCustomerContext,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";

import type { IntelligenceV2ViewModel } from "@/lib/omnichannel/presentation/intelligence-v2-view-model";

export type MoodTrend = "improving" | "stable" | "declining";

export type ConversationScoreBand = "excellent" | "good" | "fair" | "poor";

export type ConversationScore = {
  value: number;
  band: ConversationScoreBand;
  label: string;
};

export type EnrichedRecommendation = ConversationRecommendation & {
  reason: string;
};

export type HealthKpi = {
  id: string;
  label: string;
  displayValue: string;
  progress: number;
};

export type IntelligenceViewModel = {
  score: ConversationScore;
  primaryMood: ConversationMood | null;
  moodTrend: MoodTrend;
  enrichedRecommendations: EnrichedRecommendation[];
  healthKpis: HealthKpi[];
  ticketCount: number;
  v2?: IntelligenceV2ViewModel;
};

export type IntelligencePolishLabels = {
  scoreTitle: string;
  scoreExcellent: string;
  scoreGood: string;
  scoreFair: string;
  scorePoor: string;
  trendImproving: string;
  trendStable: string;
  trendDeclining: string;
  trendTitle: string;
  recommendedNextAction: string;
  recommendReasonAssignBilling: string;
  recommendReasonEscalate: string;
  recommendReasonOfferDiscount: string;
  recommendReasonReturnToAi: string;
  recommendReasonCallCustomer: string;
  recommendReasonCreateTicket: string;
  recommendReasonRequestSupervisor: string;
  overallHealth: string;
  healthTickets: string;
  healthAiMessages: string;
  dateLastWeek: string;
  eventReply: string;
  eventAiReply: string;
  eventInternalNote: string;
  eventAssignment: string;
  eventEscalation: string;
  eventResolve: string;
  eventClose: string;
  eventReopen: string;
  eventTicket: string;
  eventCustomerLinked: string;
  eventTakeOver: string;
  eventReturnToAi: string;
  eventWorkflow: string;
  eventAutomation: string;
  eventDefault: string;
};

const MOOD_EMOJI: Record<ConversationMoodId, string> = {
  happy: "😊",
  satisfied: "🙂",
  neutral: "😐",
  confused: "😕",
  frustrated: "😤",
  angry: "😠",
  very_angry: "🤬",
  escalation_risk: "⚠️",
  refund_risk: "💸",
  churn_risk: "📉",
  vip: "⭐",
  high_purchase_intent: "🛒",
};

export function moodEmoji(id: ConversationMoodId): string {
  return MOOD_EMOJI[id] ?? "😐";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreBand(value: number, labels: IntelligencePolishLabels): { band: ConversationScoreBand; label: string } {
  if (value >= 85) return { band: "excellent", label: labels.scoreExcellent };
  if (value >= 70) return { band: "good", label: labels.scoreGood };
  if (value >= 50) return { band: "fair", label: labels.scoreFair };
  return { band: "poor", label: labels.scorePoor };
}

export function computeConversationScore(
  snapshot: ConversationIntelligenceSnapshot,
  lifecycleSnapshot: LifecycleSnapshot | null | undefined,
  labels: IntelligencePolishLabels,
): ConversationScore {
  const { health, insight } = snapshot;
  let value = 88;

  if (health.status === "critical") value -= 32;
  else if (health.status === "warning") value -= 14;

  if (lifecycleSnapshot?.header.sla.breached) value -= 22;
  else if (lifecycleSnapshot?.header.sla.dueAt) value += 4;

  value -= Math.min(health.escalations * 12, 24);

  if (health.averageResponseTimeMinutes != null) {
    if (health.averageResponseTimeMinutes > 45) value -= 12;
    else if (health.averageResponseTimeMinutes > 20) value -= 6;
    else if (health.averageResponseTimeMinutes <= 10) value += 4;
  }

  const primary = insight.moods[0];
  if (primary?.id === "angry" || primary?.id === "very_angry") value -= 18;
  else if (primary?.id === "frustrated") value -= 10;
  else if (primary?.id === "happy" || primary?.id === "satisfied") value += 8;

  if (insight.explanations.some((line) => /sla|waiting|انتظار/i.test(line))) value -= 8;

  value = clamp(Math.round(value), 0, 100);
  const band = scoreBand(value, labels);
  return { value, ...band };
}

export function computeMoodTrend(messages: UnifiedMessage[]): MoodTrend {
  const customerBodies = messages
    .filter((message) => message.senderType === "customer" && !message.isInternalNote)
    .map((message) => message.body);

  if (customerBodies.length < 4) return "stable";

  const mid = Math.floor(customerBodies.length / 2);
  const firstHalf = customerBodies.slice(0, mid).join(" ");
  const secondHalf = customerBodies.slice(mid).join(" ");

  const scoreHalf = (text: string) => {
    const positive = (text.match(/thanks|thank|great|good|perfect|love|شكر|ممتاز|رائع|جيد/gi) ?? []).length;
    const negative = (text.match(/bad|worst|angry|hate|refund|cancel|سيء|غاضب|مشكلة|استرجاع|إلغاء/gi) ?? []).length;
    return positive - negative;
  };

  const delta = scoreHalf(secondHalf) - scoreHalf(firstHalf);
  if (delta >= 2) return "improving";
  if (delta <= -2) return "declining";
  return "stable";
}

function reasonForRecommendation(
  rec: ConversationRecommendation,
  explanations: string[],
  labels: IntelligencePolishLabels,
): string {
  const fromExplanation = explanations[0];
  const byId: Record<string, string> = {
    "assign-billing": labels.recommendReasonAssignBilling,
    escalate: labels.recommendReasonEscalate,
    "offer-discount": labels.recommendReasonOfferDiscount,
    "return-ai": labels.recommendReasonReturnToAi,
    "call-customer": labels.recommendReasonCallCustomer,
    "create-ticket": labels.recommendReasonCreateTicket,
    "request-supervisor": labels.recommendReasonRequestSupervisor,
  };

  if (rec.id === "offer-discount" && explanations.some((line) => /refund|pricing|price|سعر|خصم/i.test(line))) {
    return explanations.find((line) => /price|pricing|سعر/i.test(line)) ?? byId[rec.id] ?? fromExplanation ?? rec.action;
  }

  return byId[rec.id] ?? fromExplanation ?? rec.action;
}

function normalizeProgress(value: number, max: number): number {
  if (max <= 0) return 0;
  return clamp(Math.round((value / max) * 100), 0, 100);
}

export function buildHealthKpis(
  health: ConversationHealth,
  ticketCount: number,
  labels: {
    healthSla: string;
    healthAvgResponse: string;
    healthCustomerMessages: string;
    healthAgentMessages: string;
    healthAiMessages: string;
    healthEscalations: string;
    healthTickets: string;
    healthInternalNotes: string;
    minutesShort: string;
  },
): HealthKpi[] {
  return [
    {
      id: "sla",
      label: labels.healthSla,
      displayValue: health.slaLabel,
      progress: health.status === "healthy" ? 92 : health.status === "warning" ? 58 : 24,
    },
    {
      id: "avg-response",
      label: labels.healthAvgResponse,
      displayValue:
        health.averageResponseTimeMinutes != null
          ? `${health.averageResponseTimeMinutes}${labels.minutesShort}`
          : "—",
      progress:
        health.averageResponseTimeMinutes != null
          ? clamp(100 - normalizeProgress(health.averageResponseTimeMinutes, 60), 8, 100)
          : 50,
    },
    {
      id: "customer-messages",
      label: labels.healthCustomerMessages,
      displayValue: String(health.customerMessages),
      progress: normalizeProgress(health.customerMessages, 40),
    },
    {
      id: "agent-messages",
      label: labels.healthAgentMessages,
      displayValue: String(health.agentMessages),
      progress: normalizeProgress(health.agentMessages, 40),
    },
    {
      id: "ai-messages",
      label: labels.healthAiMessages,
      displayValue: String(health.aiResponses),
      progress: normalizeProgress(health.aiResponses, 30),
    },
    {
      id: "escalations",
      label: labels.healthEscalations,
      displayValue: String(health.escalations),
      progress: health.escalations === 0 ? 100 : clamp(100 - health.escalations * 25, 10, 100),
    },
    {
      id: "tickets",
      label: labels.healthTickets,
      displayValue: String(ticketCount),
      progress: ticketCount === 0 ? 100 : clamp(100 - ticketCount * 20, 15, 100),
    },
    {
      id: "notes",
      label: labels.healthInternalNotes,
      displayValue: String(health.internalNotes),
      progress: normalizeProgress(health.internalNotes, 15),
    },
  ];
}

export function buildIntelligenceViewModel(
  snapshot: ConversationIntelligenceSnapshot,
  messages: UnifiedMessage[],
  customerContext: OmnichannelCustomerContext | null | undefined,
  lifecycleSnapshot: LifecycleSnapshot | null | undefined,
  labels: IntelligencePolishLabels & {
    healthSla: string;
    healthAvgResponse: string;
    healthCustomerMessages: string;
    healthAgentMessages: string;
    healthInternalNotes: string;
    healthEscalations: string;
    minutesShort: string;
  },
): IntelligenceViewModel {
  const ticketCount = customerContext?.openTickets ?? 0;

  return {
    score: computeConversationScore(snapshot, lifecycleSnapshot, labels),
    primaryMood: snapshot.insight.moods[0] ?? null,
    moodTrend: computeMoodTrend(messages),
    enrichedRecommendations: snapshot.insight.recommendations.map((rec) => ({
      ...rec,
      reason: reasonForRecommendation(rec, snapshot.insight.explanations, labels),
    })),
    healthKpis: buildHealthKpis(snapshot.health, ticketCount, {
      ...labels,
      healthTickets: labels.healthTickets,
      healthAiMessages: labels.healthAiMessages,
    }),
    ticketCount,
  };
}

export function eventTypeLabel(
  kind: ConversationHistoryEventKind,
  labels: IntelligencePolishLabels,
): string {
  switch (kind) {
    case "customer_message":
    case "customer_first_message":
    case "agent_message":
      return labels.eventReply;
    case "ai_message":
      return labels.eventAiReply;
    case "internal_note":
      return labels.eventInternalNote;
    case "assignment":
    case "queue_change":
    case "transfer":
      return labels.eventAssignment;
    case "human_takeover":
    case "agent_joined":
      return labels.eventTakeOver;
    case "escalation":
    case "return_escalation":
      return labels.eventEscalation;
    case "conversation_resolved":
      return labels.eventResolve;
    case "conversation_closed":
      return labels.eventClose;
    case "conversation_reopened":
      return labels.eventReopen;
    case "ticket_created":
    case "ticket_resolved":
      return labels.eventTicket;
    case "customer_linked":
    case "customer_created":
    case "ownership_change":
      return labels.eventCustomerLinked;
    case "ai_takeover":
      return labels.eventReturnToAi;
    case "workflow_action":
      return labels.eventWorkflow;
    case "automation_action":
      return labels.eventAutomation;
    case "conversation_started":
      return labels.eventDefault;
    default:
      return labels.eventDefault;
  }
}

export type JourneyStageTone = "start" | "active" | "escalated" | "success" | "closed" | "default";

export function journeyStageTone(kind: ConversationHistoryEventKind): JourneyStageTone {
  if (kind === "conversation_started") return "start";
  if (kind === "escalation") return "escalated";
  if (kind === "conversation_resolved") return "success";
  if (kind === "conversation_closed") return "closed";
  if (
    kind === "assignment"
    || kind === "human_takeover"
    || kind === "agent_joined"
    || kind === "booking_created"
  ) {
    return "active";
  }
  return "default";
}

export function journeyStageClass(tone: JourneyStageTone): string {
  switch (tone) {
    case "start":
      return "border-sky-400/50 bg-sky-950/30 text-sky-200";
    case "active":
      return "border-[var(--ws-accent)]/50 bg-[var(--ws-accent-dim)] text-[var(--ws-accent)]";
    case "escalated":
      return "border-[var(--ws-warn)]/50 bg-amber-950/25 text-[var(--ws-warn)]";
    case "success":
      return "border-emerald-400/50 bg-emerald-950/25 text-emerald-300";
    case "closed":
      return "border-[var(--ws-muted)]/40 bg-[var(--ws-surface)] text-[var(--ws-muted)]";
    default:
      return "border-violet-400/40 bg-violet-950/20 text-violet-200";
  }
}
