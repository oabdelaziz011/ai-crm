import type { TimelineEvent, TimelineEventType, TimelineFilterId } from "./types";

const MESSAGE_TYPES = new Set<TimelineEventType>([
  "whatsapp_message_received",
  "whatsapp_message_sent",
  "template_sent",
  "interactive_reply",
  "facebook_message",
  "instagram_message",
  "email_received",
  "email_sent",
]);

const BOOKING_TYPES = new Set<TimelineEventType>([
  "booking_created",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_completed",
  "booking_cancelled",
]);

const INVOICE_TYPES = new Set<TimelineEventType>([
  "invoice_created",
  "invoice_paid",
  "invoice_overdue",
  "payment_received",
]);

const NOTE_TYPES = new Set<TimelineEventType>(["note_added"]);

const CALL_TYPES = new Set<TimelineEventType>(["call_started", "call_finished"]);

const AI_TYPES = new Set<TimelineEventType>([
  "ai_summary_updated",
  "automation_started",
  "automation_finished",
]);

export function timelineEventFilterGroup(type: TimelineEventType): TimelineFilterId {
  if (MESSAGE_TYPES.has(type)) return "messages";
  if (BOOKING_TYPES.has(type)) return "bookings";
  if (INVOICE_TYPES.has(type)) return "invoices";
  if (NOTE_TYPES.has(type)) return "notes";
  if (CALL_TYPES.has(type)) return "calls";
  if (AI_TYPES.has(type)) return "ai";
  return "all";
}

export function filterTimelineEvents(
  events: TimelineEvent[],
  filter: TimelineFilterId,
): TimelineEvent[] {
  if (filter === "all") return events;
  return events.filter((event) => {
    const group = event.metadata?.filterGroup ?? timelineEventFilterGroup(event.type);
    return group === filter;
  });
}

export function searchTimelineEvents(events: TimelineEvent[], query: string): TimelineEvent[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return events;

  return events.filter((event) => {
    const haystack = [
      event.type,
      event.metadata?.searchText,
      event.metadata?.detail,
      event.metadata?.actor,
      JSON.stringify(event.payload),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

export function groupTimelineEventsByDate(
  events: TimelineEvent[],
  locale: string,
): Array<{ dateKey: string; label: string; events: TimelineEvent[] }> {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const dateKey = event.occurredAt.slice(0, 10);
    const bucket = groups.get(dateKey) ?? [];
    bucket.push(event);
    groups.set(dateKey, bucket);
  }

  return [...groups.entries()].map(([dateKey, bucket]) => ({
    dateKey,
    label: formatter.format(new Date(`${dateKey}T12:00:00.000Z`)),
    events: bucket,
  }));
}

export const TIMELINE_FILTERS: TimelineFilterId[] = [
  "all",
  "messages",
  "bookings",
  "invoices",
  "notes",
  "calls",
  "notifications",
  "automation",
  "email",
  "ai",
];
