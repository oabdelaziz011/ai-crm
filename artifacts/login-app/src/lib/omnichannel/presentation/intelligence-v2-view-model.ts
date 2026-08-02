import { differenceInMinutes, intervalToDuration } from "date-fns";
import type {
  ConversationHealth,
  ConversationHistoryEvent,
  ConversationIntelligenceSnapshot,
  ConversationMoodId,
  ConversationRecommendation,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import type { LifecycleSnapshot } from "@/lib/conversation-lifecycle";
import type {
  OmnichannelAiAssistModel,
  OmnichannelCustomerContext,
  UnifiedConversation,
  UnifiedMessage,
} from "@/lib/omnichannel/types/unified-conversation";
import type {
  ConversationScoreBand,
  MoodTrend,
} from "@/lib/omnichannel/presentation/intelligence-view-model";

export type IntelligenceV2Labels = {
  satisfactionTitle: string;
  confidenceTitle: string;
  analysisReasonTitle: string;
  positiveSignals: string;
  negativeSignals: string;
  smartSummaryTitle: string;
  summaryRequestType: string;
  summaryReason: string;
  summaryLastAction: string;
  summaryFollowUp: string;
  summaryLastReply: string;
  generalInquiry: string;
  latestCustomerMessage: string;
  latestTeamReply: string;
  summaryWho: string;
  summaryDone: string;
  summaryNeeded: string;
  yes: string;
  no: string;
  kpiDuration: string;
  kpiMessages: string;
  kpiFirstReply: string;
  kpiAiPercent: string;
  kpiHumanPercent: string;
  kpiSatisfaction: string;
  healthScoreTitle: string;
  healthMessageCount: string;
  healthFirstReply: string;
  healthLastReply: string;
  healthTransfers: string;
  healthHasTicket: string;
  healthHasCrm: string;
  healthHasNotes: string;
  healthNewCustomer: string;
  healthVip: string;
  checklistTitle: string;
  checkShowPrices: string;
  checkShowDiscounts: string;
  checkSuggestAppointment: string;
  checkTransferSales: string;
  checkCreateTicket: string;
  checkNeedsFollowUp: string;
  journeyStarted: string;
  journeyAiReplied: string;
  journeyAgentJoined: string;
  journeyTransferred: string;
  journeyTicketCreated: string;
  journeyResolved: string;
  journeyClosed: string;
  reasonPositiveWords: string;
  reasonIssueResolved: string;
  reasonFastReply: string;
  reasonSlowReply: string;
  scoreExcellent: string;
  scoreGood: string;
  scoreFair: string;
  scorePoor: string;
};

export type SatisfactionAnalysis = {
  score: number;
  band: ConversationScoreBand;
  bandLabel: string;
  confidence: number;
  trend: MoodTrend;
  trendArrow: "↑" | "→" | "↓";
  positiveReasons: string[];
  negativeReasons: string[];
};

export type RecommendationChecklistItem = {
  id: string;
  label: string;
  confidence: number;
  suggested: boolean;
};

export type HealthDashboardModel = {
  score: number;
  status: ConversationHealth["status"];
  sla: string;
  messageCount: number;
  firstReplyLabel: string;
  lastReplyLabel: string;
  transfers: number;
  escalations: number;
  hasTicket: boolean;
  hasCrm: boolean;
  hasInternalNotes: boolean;
  isNewCustomer: boolean;
  isVip: boolean;
};

export type SmartSummaryModel = {
  requestType: string;
  contactReason: string;
  lastAction: string;
  needsFollowUp: boolean;
  followUpLabel: string;
  lastReply: string;
};

export type ConversationKpiStripModel = {
  durationLabel: string;
  messageCount: number;
  firstReplyLabel: string;
  aiPercent: number;
  humanPercent: number;
  satisfaction: number;
};

export type JourneyStageV2 = {
  id: string;
  label: string;
  state: "completed" | "current" | "upcoming";
  tone: "start" | "active" | "escalated" | "success" | "closed" | "default";
};

export type IntelligenceV2ViewModel = {
  satisfaction: SatisfactionAnalysis;
  checklist: RecommendationChecklistItem[];
  healthDashboard: HealthDashboardModel;
  smartSummary: SmartSummaryModel;
  kpiStrip: ConversationKpiStripModel;
  journeyStages: JourneyStageV2[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreBand(value: number, labels: IntelligenceV2Labels): { band: ConversationScoreBand; label: string } {
  if (value >= 85) return { band: "excellent", label: labels.scoreExcellent };
  if (value >= 70) return { band: "good", label: labels.scoreGood };
  if (value >= 50) return { band: "fair", label: labels.scoreFair };
  return { band: "poor", label: labels.scorePoor };
}

function moodToSatisfaction(moodId: ConversationMoodId | undefined, base: number): number {
  const map: Partial<Record<ConversationMoodId, number>> = {
    happy: 92,
    satisfied: 85,
    neutral: 72,
    confused: 58,
    frustrated: 45,
    angry: 32,
    very_angry: 22,
    escalation_risk: 38,
    refund_risk: 35,
    churn_risk: 30,
    vip: 88,
    high_purchase_intent: 80,
  };
  return moodId ? (map[moodId] ?? base) : base;
}

function classifyExplanation(text: string): "positive" | "negative" {
  if (/repeat|sla|waiting|negative|refund|cancel|manager|delay|انتظار|سلبي|كرر|تأخير|استرجاع|إلغاء|مدير/i.test(text)) {
    return "negative";
  }
  return "positive";
}

function computeResponseGapMinutes(messages: UnifiedMessage[], fromEnd = false): number | null {
  const sorted = [...messages]
    .filter((message) => !message.isInternalNote)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (fromEnd) {
    for (let index = sorted.length - 2; index >= 0; index -= 1) {
      const current = sorted[index];
      const next = sorted[index + 1];
      if (current.senderType === "customer" && (next.senderType === "agent" || next.senderType === "assistant")) {
        return Math.max(0, differenceInMinutes(new Date(next.timestamp), new Date(current.timestamp)));
      }
    }
    return null;
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (current.senderType === "customer" && (next.senderType === "agent" || next.senderType === "assistant")) {
      return Math.max(0, differenceInMinutes(new Date(next.timestamp), new Date(current.timestamp)));
    }
  }
  return null;
}

function formatMinutesLabel(minutes: number | null, minutesShort: string, notSet: string): string {
  if (minutes == null) return notSet;
  if (minutes < 1) return `<1${minutesShort}`;
  return `${minutes}${minutesShort}`;
}

function formatConversationDuration(messages: UnifiedMessage[], createdAt: string | undefined, notSet: string): string {
  const timestamps = messages.map((message) => new Date(message.timestamp).getTime()).filter(Number.isFinite);
  const start = createdAt ? new Date(createdAt).getTime() : timestamps[0];
  const end = timestamps.at(-1);
  if (!start || !end) return notSet;
  const duration = intervalToDuration({ start: new Date(start), end: new Date(end) });
  const parts: string[] = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}m`);
  if (parts.length === 0) parts.push(`${Math.max(1, differenceInMinutes(new Date(end), new Date(start)))}m`);
  return parts.join(" ");
}

function historyHasKind(history: ConversationHistoryEvent[], kinds: string[]): boolean {
  return history.some((event) => kinds.includes(event.kind));
}

function buildPositiveReasons(
  labels: IntelligenceV2Labels,
  explanations: string[],
  avgResponse: number | null,
  resolved: boolean,
): string[] {
  const positive = explanations.filter((line) => classifyExplanation(line) === "positive");
  const defaults: string[] = [];
  if (avgResponse != null && avgResponse <= 10) defaults.push(labels.reasonFastReply);
  if (resolved) defaults.push(labels.reasonIssueResolved);
  defaults.push(labels.reasonPositiveWords);
  return [...new Set([...positive, ...defaults])].slice(0, 3);
}

function buildNegativeReasons(
  labels: IntelligenceV2Labels,
  explanations: string[],
  avgResponse: number | null,
): string[] {
  const negative = explanations.filter((line) => classifyExplanation(line) === "negative");
  const defaults: string[] = [];
  if (avgResponse != null && avgResponse > 20) defaults.push(labels.reasonSlowReply);
  return [...new Set([...negative, ...defaults])].slice(0, 3);
}

function buildChecklist(
  labels: IntelligenceV2Labels,
  recommendations: ConversationRecommendation[],
  messages: UnifiedMessage[],
  customerContext: OmnichannelCustomerContext | null | undefined,
  aiAssist: OmnichannelAiAssistModel,
  lifecycleSnapshot: LifecycleSnapshot | null | undefined,
): RecommendationChecklistItem[] {
  const corpus = messages.filter((m) => m.senderType === "customer").map((m) => m.body).join(" ");
  const base = Math.round(Math.min(92, Math.max(45, aiAssist.confidence * 100)));
  const recIds = new Set(recommendations.map((rec) => rec.id));
  const recConfidence = (id: string, fallback: number) =>
    recommendations.find((rec) => rec.id === id)?.confidence ?? fallback;

  return [
    {
      id: "show-prices",
      label: labels.checkShowPrices,
      confidence: /price|pricing|سعر|عرض/i.test(corpus) ? base + 12 : base - 15,
      suggested: /price|pricing|سعر|عرض/i.test(corpus),
    },
    {
      id: "show-discounts",
      label: labels.checkShowDiscounts,
      confidence: recConfidence("offer-discount", base + 6),
      suggested: recIds.has("offer-discount") || /discount|خصم|refund|استرجاع/i.test(corpus),
    },
    {
      id: "suggest-appointment",
      label: labels.checkSuggestAppointment,
      confidence: (customerContext?.recentBookings ?? 0) > 0 ? base + 8 : base - 10,
      suggested: /book|appointment|schedule|حجز|موعد/i.test(corpus),
    },
    {
      id: "transfer-sales",
      label: labels.checkTransferSales,
      confidence: base + 5,
      suggested: /buy|purchase|شراء|sales|مبيعات/i.test(corpus),
    },
    {
      id: "create-ticket",
      label: labels.checkCreateTicket,
      confidence: recConfidence("create-ticket", base + 3),
      suggested: recIds.has("create-ticket") || (customerContext?.openTickets ?? 0) > 0,
    },
    {
      id: "needs-follow-up",
      label: labels.checkNeedsFollowUp,
      confidence: recConfidence("escalate", base + 10),
      suggested:
        recIds.has("escalate")
        || Boolean(lifecycleSnapshot?.activeEscalation)
        || aiAssist.escalationRecommended,
    },
  ].map((item) => ({ ...item, confidence: clamp(item.confidence, 20, 99) }));
}

function buildJourneyStages(
  labels: IntelligenceV2Labels,
  history: ConversationHistoryEvent[],
  lifecycleState: string | undefined,
): JourneyStageV2[] {
  const defs: Array<{ id: string; label: string; kinds: string[]; tone: JourneyStageV2["tone"] }> = [
    { id: "started", label: labels.journeyStarted, kinds: ["conversation_started"], tone: "start" },
    { id: "ai", label: labels.journeyAiReplied, kinds: ["ai_message", "ai_takeover"], tone: "default" },
    { id: "agent", label: labels.journeyAgentJoined, kinds: ["human_takeover", "agent_joined", "assignment"], tone: "active" },
    { id: "transfer", label: labels.journeyTransferred, kinds: ["transfer", "queue_change"], tone: "active" },
    { id: "ticket", label: labels.journeyTicketCreated, kinds: ["ticket_created"], tone: "escalated" },
    { id: "resolved", label: labels.journeyResolved, kinds: ["conversation_resolved"], tone: "success" },
    { id: "closed", label: labels.journeyClosed, kinds: ["conversation_closed"], tone: "closed" },
  ];

  const completedIds = defs.filter((def) => historyHasKind(history, def.kinds)).map((def) => def.id);
  let currentId = completedIds.at(-1) ?? "started";
  if (lifecycleState === "closed") currentId = "closed";
  else if (lifecycleState === "resolved") currentId = "resolved";
  else if (completedIds.includes("escalation") || historyHasKind(history, ["escalation"])) {
    currentId = "ticket";
  }

  return defs.map((def) => {
    const completed = completedIds.includes(def.id);
    const current = def.id === currentId && !completedIds.includes("closed");
    return {
      id: def.id,
      label: def.label,
      tone: def.tone,
      state: completed ? "completed" : current ? "current" : "upcoming",
    };
  });
}

function buildSmartSummary(
  labels: IntelligenceV2Labels,
  conversation: UnifiedConversation | null,
  snapshot: ConversationIntelligenceSnapshot,
  history: ConversationHistoryEvent[],
  aiAssist: OmnichannelAiAssistModel,
  messages: UnifiedMessage[],
): SmartSummaryModel {
  const lastEvent = history[0];
  const resolved = historyHasKind(history, ["conversation_resolved", "conversation_closed"]);
  const needsFollowUp =
    !resolved
    && (aiAssist.escalationRecommended || snapshot.health.escalations > 0 || aiAssist.customerTone === "urgent");

  const lastCustomerMessage = [...messages]
    .reverse()
    .find((message) => message.senderType === "customer" && !message.isInternalNote)?.body?.trim();
  const lastTeamReply = [...messages]
    .reverse()
    .find((message) => (message.senderType === "agent" || message.senderType === "assistant") && !message.isInternalNote)
    ?.body?.trim();

  const intent = aiAssist.intent?.trim();
  const requestType =
    intent && !/^general inquiry$/i.test(intent) ? intent : labels.generalInquiry;

  const contactReason =
    lastCustomerMessage?.slice(0, 120)
    || intent
    || snapshot.insight.summary.split(/[.!?]/)[0]?.trim()
    || labels.summaryReason;

  const lastAction = lastEvent
    ? `${lastEvent.action}${lastEvent.target ? ` — ${lastEvent.target}` : ""}`
    : labels.summaryLastAction;

  const lastReply = lastTeamReply?.slice(0, 140) || labels.latestTeamReply;

  return {
    requestType,
    contactReason,
    lastAction,
    needsFollowUp,
    followUpLabel: needsFollowUp ? labels.yes : labels.no,
    lastReply,
  };
}

export function buildIntelligenceV2ViewModel(input: {
  snapshot: ConversationIntelligenceSnapshot;
  messages: UnifiedMessage[];
  conversation: UnifiedConversation | null;
  customerContext: OmnichannelCustomerContext | null | undefined;
  lifecycleSnapshot: LifecycleSnapshot | null | undefined;
  aiAssist: OmnichannelAiAssistModel;
  trend: MoodTrend;
  labels: IntelligenceV2Labels;
  minutesShort: string;
  notSet: string;
}): IntelligenceV2ViewModel {
  const { snapshot, messages, conversation, customerContext, lifecycleSnapshot, aiAssist, trend, labels, minutesShort, notSet } =
    input;
  const { health, insight, history } = snapshot;
  const primaryMood = insight.moods[0];
  const baseScore = moodToSatisfaction(primaryMood?.id, 72);
  const satisfactionScore = clamp(
    baseScore
      - (health.status === "critical" ? 18 : health.status === "warning" ? 8 : 0)
      - Math.min(health.escalations * 8, 20),
    15,
    99,
  );
  const band = scoreBand(satisfactionScore, labels);
  const resolved = historyHasKind(history, ["conversation_resolved", "conversation_closed"]);

  const firstReplyMin = computeResponseGapMinutes(messages, false);
  const lastReplyMin = computeResponseGapMinutes(messages, true);
  const totalMessages = messages.filter((message) => !message.isInternalNote).length;
  const aiCount = messages.filter((message) => message.senderType === "assistant").length;
  const humanCount = messages.filter((message) => message.senderType === "agent").length;
  const replyTotal = aiCount + humanCount;
  const aiPercent = replyTotal > 0 ? Math.round((aiCount / replyTotal) * 100) : 0;
  const humanPercent = replyTotal > 0 ? 100 - aiPercent : 0;

  const healthScore = clamp(
    (health.status === "healthy" ? 95 : health.status === "warning" ? 68 : 38)
      - health.escalations * 8
      - ((customerContext?.openTickets ?? 0) > 0 ? 5 : 0),
    10,
    100,
  );

  const isVip =
    insight.moods.some((mood) => mood.id === "vip")
    || (customerContext?.recentBookings ?? 0) >= 3;
  const isNewCustomer = !conversation?.customer?.id || (customerContext?.recentBookings ?? 0) === 0;

  return {
    satisfaction: {
      score: satisfactionScore,
      band: band.band,
      bandLabel: band.label,
      confidence: primaryMood?.confidence ?? Math.round(aiAssist.confidence * 100),
      trend,
      trendArrow: trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→",
      positiveReasons: buildPositiveReasons(labels, insight.explanations, health.averageResponseTimeMinutes, resolved),
      negativeReasons: buildNegativeReasons(labels, insight.explanations, health.averageResponseTimeMinutes),
    },
    checklist: buildChecklist(labels, insight.recommendations, messages, customerContext, aiAssist, lifecycleSnapshot),
    healthDashboard: {
      score: healthScore,
      status: health.status,
      sla: health.slaLabel,
      messageCount: totalMessages,
      firstReplyLabel: formatMinutesLabel(firstReplyMin, minutesShort, notSet),
      lastReplyLabel: formatMinutesLabel(lastReplyMin, minutesShort, notSet),
      transfers: health.transfers,
      escalations: health.escalations,
      hasTicket: (customerContext?.openTickets ?? 0) > 0 || historyHasKind(history, ["ticket_created"]),
      hasCrm: Boolean(conversation?.customer?.id) || historyHasKind(history, ["customer_linked", "customer_created"]),
      hasInternalNotes: health.internalNotes > 0,
      isNewCustomer,
      isVip,
    },
    smartSummary: buildSmartSummary(labels, conversation, snapshot, history, aiAssist, messages),
    kpiStrip: {
      durationLabel: formatConversationDuration(messages, conversation?.source.created_at, notSet),
      messageCount: totalMessages,
      firstReplyLabel: formatMinutesLabel(firstReplyMin, minutesShort, notSet),
      aiPercent,
      humanPercent,
      satisfaction: satisfactionScore,
    },
    journeyStages: buildJourneyStages(labels, history, conversation?.lifecycleState),
  };
}
