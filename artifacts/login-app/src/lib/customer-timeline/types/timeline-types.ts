/**
 * Customer Activity Timeline — domain types (read model).
 * TimelineActivity extends the legacy TimelineEvent shape for backward compatibility.
 */
export const TIMELINE_SOURCES = [
  "bookings",
  "calendar",
  "notifications",
  "email",
  "whatsapp",
  "automation",
  "invoices",
  "payments",
  "notes",
  "manual",
  "lifecycle",
  "agent",
  "ai",
  "calls",
  "documents",
] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

export const TIMELINE_CATEGORIES = [
  "lifecycle",
  "communication",
  "booking",
  "billing",
  "note",
  "agent",
  "call",
  "email",
  "automation",
  "notification",
  "payment",
  "manual",
  "ai",
  "system",
] as const;
export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export const TIMELINE_GROUP_MODES = [
  "day",
  "week",
  "month",
  "conversation",
  "workflow",
  "booking",
] as const;
export type TimelineGroupMode = (typeof TIMELINE_GROUP_MODES)[number];

export const TIMELINE_VISIBILITY = ["public", "internal", "system"] as const;
export type TimelineVisibility = (typeof TIMELINE_VISIBILITY)[number];

export type TimelineActor = {
  id: string | null;
  label: string | null;
  type: "customer" | "employee" | "system" | "automation";
};

export type TimelineAttachment = {
  id: string;
  type: string;
  url?: string | null;
  label?: string | null;
};

export type TimelineMetadata = {
  actor?: string | null;
  actorId?: string | null;
  detail?: string | null;
  searchText?: string;
  filterGroup?: string;
  channel?: string | null;
  employeeId?: string | null;
  bookingId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  conversationId?: string | null;
  workflowId?: string | null;
  unread?: boolean;
  visibility?: TimelineVisibility;
  attachments?: TimelineAttachment[];
  [key: string]: unknown;
};

export type TimelineFilter = {
  dateFrom?: string | null;
  dateTo?: string | null;
  categories?: TimelineCategory[];
  sources?: TimelineSource[];
  channels?: string[];
  employeeId?: string | null;
  automationOnly?: boolean;
  bookingOnly?: boolean;
  invoiceOnly?: boolean;
  unreadOnly?: boolean;
  legacyFilterId?: string;
};

export type TimelineCursor = {
  occurredAt: string;
  id: string;
};

export type TimelineFetchInput = {
  customerId: string;
  companyId?: string | null;
};

export type TimelinePageRequest = TimelineFetchInput & {
  cursor?: TimelineCursor | null;
  limit?: number;
  filter?: TimelineFilter;
  search?: string;
  groupMode?: TimelineGroupMode;
};

export type TimelineGroup = {
  key: string;
  label: string;
  mode: TimelineGroupMode;
  activities: TimelineActivity[];
};

export type TimelinePage = {
  activities: TimelineActivity[];
  groups: TimelineGroup[];
  nextCursor: TimelineCursor | null;
  total: number;
  hasMore: boolean;
};

export const TIMELINE_EVENT_TYPES = [
  "customer_created",
  "whatsapp_message_received",
  "whatsapp_message_sent",
  "template_sent",
  "interactive_reply",
  "facebook_message",
  "instagram_message",
  "booking_created",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_completed",
  "booking_cancelled",
  "calendar_event",
  "invoice_created",
  "invoice_paid",
  "invoice_overdue",
  "payment_received",
  "note_added",
  "customer_updated",
  "conversation_closed",
  "conversation_reopened",
  "call_started",
  "call_finished",
  "email_received",
  "email_sent",
  "notification_delivered",
  "automation_started",
  "automation_finished",
  "manual_activity",
  "ai_summary_updated",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/** @deprecated Use TimelineCategory */
export type TimelineEventCategory = TimelineCategory;

/** @deprecated Use TimelineFilter legacy field */
export type TimelineFilterId =
  | "all"
  | "messages"
  | "bookings"
  | "invoices"
  | "notes"
  | "calls"
  | "ai"
  | "notifications"
  | "automation"
  | "email";

export type TimelineActivity = {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  source: TimelineSource | string;
  category?: TimelineCategory;
  payload: Record<string, unknown>;
  metadata?: TimelineMetadata;
  actor?: TimelineActor;
  visibility?: TimelineVisibility;
};

/** Backward-compatible alias */
export type TimelineEvent = TimelineActivity;

export interface TimelineActivitySource {
  readonly sourceId: TimelineSource | string;
  collect(input: TimelineFetchInput): Promise<TimelineActivity[]>;
}

/** @deprecated Use TimelineActivitySource */
export interface TimelineEventProvider {
  readonly providerId: string;
  getEvents(input: TimelineFetchInput): Promise<TimelineEvent[]>;
}

export type TimelineRenderContext = {
  locale: string;
  translate: (key: string, options?: Record<string, unknown>) => string;
};

export type CustomerProfileMetrics = {
  bookingsCount: number;
  invoicesCount: number;
  lastInteractionAt: string | null;
};

export type EnrichedTimelineActivity = TimelineActivity & {
  title: string;
  description: string | null;
  iconKey: string;
  accentClass: string;
  relativeTime?: string;
};

export type EnrichedTimelineGroup = Omit<TimelineGroup, "activities"> & {
  activities: EnrichedTimelineActivity[];
};
