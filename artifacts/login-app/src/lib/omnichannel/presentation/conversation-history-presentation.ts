import {
  differenceInDays,
  format,
  isSameDay,
  isYesterday,
  startOfDay,
} from "date-fns";
import type {
  ConversationHistoryCardModel,
  ConversationHistoryDateGroupId,
  ConversationHistoryEvent,
  ConversationHistoryFilterId,
  ConversationHistoryGroup,
  ConversationHistoryIconKey,
} from "@/lib/omnichannel/presentation/conversation-intelligence-types";
import { formatSmartTime, type SmartTimeLabels } from "@/lib/omnichannel/presentation/smart-time";

const MESSAGE_KINDS = new Set([
  "customer_first_message",
  "customer_message",
  "agent_message",
  "ai_message",
]);

const ASSIGNMENT_KINDS = new Set([
  "assignment",
  "human_takeover",
  "agent_joined",
  "transfer",
  "queue_change",
]);

const AI_KINDS = new Set(["ai_message", "ai_takeover", "ai_summary"]);
const CRM_KINDS = new Set(["customer_linked", "customer_created", "ownership_change"]);
const INVOICE_KINDS = new Set(["invoice_created", "invoice_paid"]);
const BOOKING_KINDS = new Set(["booking_created", "booking_updated"]);
const ESCALATION_KINDS = new Set(["escalation", "return_escalation"]);
const NOTE_KINDS = new Set(["internal_note"]);
const TICKET_KINDS = new Set(["ticket_created", "ticket_resolved"]);
const WORKFLOW_KINDS = new Set(["workflow_action"]);
const AUTOMATION_KINDS = new Set(["automation_action"]);

export type ConversationHistorySearchContext = {
  customerName?: string;
  agentNames?: string[];
  aiSummary?: string;
};

export type ConversationHistoryDateLabels = {
  today: string;
  yesterday: string;
  last7Days: string;
  last30Days: string;
  older: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function resolveDateGroupId(date: Date, now: Date): ConversationHistoryDateGroupId {
  if (isSameDay(date, now)) return "today";
  if (isYesterday(date)) return "yesterday";
  const days = differenceInDays(now, date);
  if (days <= 7) return "last_7_days";
  if (days <= 30) return "last_30_days";
  return "older";
}

export function buildConversationHistoryCard(
  event: ConversationHistoryEvent,
  smartTimeLabels: SmartTimeLabels,
  now: Date = new Date(),
): ConversationHistoryCardModel {
  const smart = formatSmartTime(event.timestamp, smartTimeLabels, now);
  const actorName = event.actorLabel?.trim() || "";

  return {
    id: event.id,
    event,
    timeLabel: format(new Date(event.timestamp), "p"),
    relativeTime: smart.display,
    exactTime: smart.exact,
    actorName,
    actorInitials: initials(actorName),
  };
}

export function filterConversationHistoryEvents(
  events: ConversationHistoryEvent[],
  filter: ConversationHistoryFilterId,
): ConversationHistoryEvent[] {
  if (filter === "everything") return events;
  if (filter === "messages") return events.filter((event) => MESSAGE_KINDS.has(event.kind));
  if (filter === "assignments") return events.filter((event) => ASSIGNMENT_KINDS.has(event.kind));
  if (filter === "ai") return events.filter((event) => AI_KINDS.has(event.kind));
  if (filter === "crm") return events.filter((event) => CRM_KINDS.has(event.kind));
  if (filter === "invoices") return events.filter((event) => INVOICE_KINDS.has(event.kind));
  if (filter === "bookings") return events.filter((event) => BOOKING_KINDS.has(event.kind));
  if (filter === "escalations") return events.filter((event) => ESCALATION_KINDS.has(event.kind));
  if (filter === "notes") return events.filter((event) => NOTE_KINDS.has(event.kind));
  if (filter === "tickets") return events.filter((event) => TICKET_KINDS.has(event.kind));
  if (filter === "workflow") return events.filter((event) => WORKFLOW_KINDS.has(event.kind));
  if (filter === "automation") return events.filter((event) => AUTOMATION_KINDS.has(event.kind));
  return events;
}

export function formatHistoryEventDescription(event: ConversationHistoryEvent): string {
  const action = event.action.trim();
  const target = event.target?.trim();

  if (event.kind === "internal_note" && target) {
    return `${action}\n"${target}"`;
  }

  if (
    target
    && (event.kind === "customer_message"
      || event.kind === "customer_first_message"
      || event.kind === "agent_message"
      || event.kind === "ai_message")
  ) {
    return target;
  }

  if (target && target !== action) {
    return `${action}\n${target}`;
  }

  return action;
}

export function searchConversationHistoryEvents(
  events: ConversationHistoryEvent[],
  query: string,
  context?: ConversationHistorySearchContext,
): ConversationHistoryEvent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return events;

  const summaryMatch = context?.aiSummary?.toLowerCase().includes(normalized) ?? false;
  const customerMatch = context?.customerName?.toLowerCase().includes(normalized) ?? false;
  const agentMatch =
    context?.agentNames?.some((name) => name.toLowerCase().includes(normalized)) ?? false;

  return events.filter((event) => {
    if (event.searchableText.includes(normalized)) return true;
    if (customerMatch && (event.actorType === "customer" || event.kind.includes("customer"))) return true;
    if (agentMatch && event.actorType === "agent") return true;
    if (summaryMatch && event.kind === "ai_summary") return true;
    return false;
  });
}

export function groupConversationHistoryCards(
  cards: ConversationHistoryCardModel[],
  dateLabels: ConversationHistoryDateLabels,
  now: Date = new Date(),
): ConversationHistoryGroup[] {
  const order: ConversationHistoryDateGroupId[] = [
    "today",
    "yesterday",
    "last_7_days",
    "last_30_days",
    "older",
  ];

  const labelByGroup: Record<ConversationHistoryDateGroupId, string> = {
    today: dateLabels.today,
    yesterday: dateLabels.yesterday,
    last_7_days: dateLabels.last7Days,
    last_30_days: dateLabels.last30Days,
    older: dateLabels.older,
  };

  const buckets = new Map<ConversationHistoryDateGroupId, ConversationHistoryCardModel[]>();
  for (const card of cards) {
    const groupId = resolveDateGroupId(new Date(card.event.timestamp), now);
    const bucket = buckets.get(groupId) ?? [];
    bucket.push(card);
    buckets.set(groupId, bucket);
  }

  return order
    .filter((groupId) => (buckets.get(groupId)?.length ?? 0) > 0)
    .map((groupId) => ({
      groupId,
      label: labelByGroup[groupId],
      cards: buckets.get(groupId) ?? [],
    }));
}

export function historyIconKeyToLucide(iconKey: ConversationHistoryIconKey): string {
  return iconKey;
}
