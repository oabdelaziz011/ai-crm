/** Future-ready contracts for conversation intelligence UI. Swap providers without UI changes. */

export type ConversationHistoryEventKind =
  | "conversation_started"
  | "customer_first_message"
  | "customer_message"
  | "ai_message"
  | "agent_message"
  | "agent_joined"
  | "ownership_change"
  | "assignment"
  | "queue_change"
  | "escalation"
  | "return_escalation"
  | "internal_note"
  | "customer_linked"
  | "customer_created"
  | "booking_created"
  | "booking_updated"
  | "invoice_created"
  | "invoice_paid"
  | "ticket_created"
  | "ticket_resolved"
  | "ai_summary"
  | "ai_takeover"
  | "human_takeover"
  | "conversation_resolved"
  | "conversation_reopened"
  | "conversation_closed"
  | "transfer"
  | "status_change"
  | "workflow_action"
  | "automation_action";

export type ConversationHistoryFilterId =
  | "everything"
  | "messages"
  | "assignments"
  | "ai"
  | "crm"
  | "invoices"
  | "bookings"
  | "escalations"
  | "notes"
  | "tickets"
  | "workflow"
  | "automation";

export type ConversationHistoryBadgeTone =
  | "default"
  | "accent"
  | "warn"
  | "danger"
  | "violet"
  | "success";

export type ConversationHistoryEvent = {
  id: string;
  kind: ConversationHistoryEventKind;
  timestamp: string;
  actorId: string | null;
  actorLabel: string | null;
  actorType: "customer" | "agent" | "ai" | "system" | "automation";
  action: string;
  target: string | null;
  summary: string;
  searchableText: string;
  filterCategory: ConversationHistoryFilterId;
  badgeLabel: string;
  badgeTone: ConversationHistoryBadgeTone;
  iconKey: ConversationHistoryIconKey;
  payload?: Record<string, unknown>;
  assigneeUserId?: string | null;
  assigneeAiEmployeeId?: string | null;
  opensCustomer360?: boolean;
  journeyEligible?: boolean;
};

export type ConversationHistoryIconKey =
  | "play"
  | "message"
  | "bot"
  | "user"
  | "users"
  | "layers"
  | "alert"
  | "sticky"
  | "link"
  | "user-plus"
  | "calendar"
  | "receipt"
  | "ticket"
  | "sparkles"
  | "refresh"
  | "check"
  | "x"
  | "arrow-up"
  | "shuffle"
  | "workflow"
  | "automation";

export type ConversationMoodId =
  | "happy"
  | "satisfied"
  | "neutral"
  | "confused"
  | "frustrated"
  | "angry"
  | "very_angry"
  | "escalation_risk"
  | "refund_risk"
  | "churn_risk"
  | "vip"
  | "high_purchase_intent";

export type ConversationMood = {
  id: ConversationMoodId;
  label: string;
  confidence: number;
};

export type ConversationRecommendation = {
  id: string;
  action: string;
  confidence: number;
};

export type ConversationInsight = {
  providerId: string;
  language: "ar" | "en";
  direction: "rtl" | "ltr";
  moods: ConversationMood[];
  explanations: string[];
  recommendations: ConversationRecommendation[];
  summary: string;
};

export type ConversationHealthStatus = "healthy" | "warning" | "critical";

export type ConversationHealth = {
  status: ConversationHealthStatus;
  slaLabel: string;
  averageResponseTimeMinutes: number | null;
  agentMessages: number;
  customerMessages: number;
  internalNotes: number;
  escalations: number;
  transfers: number;
  aiResponses: number;
  humanResponses: number;
};

export type CustomerJourneyStep = {
  id: string;
  label: string;
  timestamp: string;
  kind: ConversationHistoryEventKind;
  eventId: string;
  clickable: boolean;
};

export type ConversationHistoryCardModel = {
  id: string;
  event: ConversationHistoryEvent;
  timeLabel: string;
  relativeTime: string;
  exactTime: string;
  actorName: string;
  actorInitials: string;
};

export type ConversationHistoryDateGroupId =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "older";

export type ConversationHistoryGroup = {
  groupId: ConversationHistoryDateGroupId;
  label: string;
  cards: ConversationHistoryCardModel[];
};

export type ConversationIntelligenceSnapshot = {
  insight: ConversationInsight;
  health: ConversationHealth;
  history: ConversationHistoryEvent[];
  journey: CustomerJourneyStep[];
};
