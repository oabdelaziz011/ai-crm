export const TIMELINE_ENTITY_TYPES = ["customer", "account"] as const;
export type TimelineEntityType = (typeof TIMELINE_ENTITY_TYPES)[number] | string;

export const TIMELINE_SORT_ORDERS = ["newest", "oldest"] as const;
export type TimelineSortOrder = (typeof TIMELINE_SORT_ORDERS)[number];

export const TIMELINE_EVENT_MODULES = [
  "crm",
  "tickets",
  "email",
  "whatsapp",
  "ai",
  "notes",
  "tasks",
  "workflows",
  "bookings",
  "billing",
  "notifications",
  "automation",
  "system",
] as const;
export type TimelineSourceModule = (typeof TIMELINE_EVENT_MODULES)[number] | string;

export const TIMELINE_EVENT_TYPES = [
  "crm_update",
  "customer_created",
  "customer_updated",
  "note_added",
  "task_created",
  "task_completed",
  "ticket_created",
  "ticket_updated",
  "ticket_closed",
  "email_received",
  "email_sent",
  "whatsapp_message_received",
  "whatsapp_message_sent",
  "ai_conversation_started",
  "ai_conversation_message",
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "booking_created",
  "booking_confirmed",
  "booking_rescheduled",
  "booking_completed",
  "booking_cancelled",
  "invoice_created",
  "invoice_paid",
  "notification_delivered",
  "automation_started",
  "automation_finished",
  "system_event",
] as const;
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number] | string;

export type TimelineActorType = "customer" | "employee" | "system" | "automation" | "ai";

export type TimelineActor = {
  id: string | null;
  label: string | null;
  type: TimelineActorType;
};

export type TimelineEvent = {
  id: string;
  timestamp: string;
  actor: TimelineActor;
  eventType: TimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  sourceModule: TimelineSourceModule;
  entityType: TimelineEntityType;
  entityId: string;
  companyId: string;
};

export type TimelineEntityScope = {
  entityType: TimelineEntityType;
  entityId: string;
  companyId: string;
};

export type TimelineAccessContext = {
  userId: string;
  companyId: string;
  isSuperAdmin: boolean;
  hasPermission: (code: string) => boolean;
};

export type TimelineCursor = {
  timestamp: string;
  id: string;
  sourceModule: TimelineSourceModule;
};

export type TimelineQueryFilter = {
  eventTypes?: TimelineEventType[];
  sourceModules?: TimelineSourceModule[];
  dateFrom?: string | null;
  dateTo?: string | null;
  search?: string | null;
};

export type TimelineQueryRequest = TimelineEntityScope & {
  cursor?: TimelineCursor | null;
  limit?: number;
  sort?: TimelineSortOrder;
  filter?: TimelineQueryFilter;
  additionalFilter?: (event: TimelineEvent) => boolean;
};

export type TimelineQueryPage = {
  events: TimelineEvent[];
  nextCursor: TimelineCursor | null;
  total: number;
  hasMore: boolean;
};

export type TimelineCollectInput = TimelineEntityScope & {
  filter?: TimelineQueryFilter;
};

export type TimelinePublisher = {
  moduleId: string;
  sourceModule: TimelineSourceModule;
  entityTypes: TimelineEntityType[];
  supportedEventTypes: TimelineEventType[];
  requiredPermissions?: string[];
  collect: (ctx: TimelineAccessContext, input: TimelineCollectInput) => Promise<TimelineEvent[]>;
};

export type TimelineEntityAccessPort = {
  assertEntityAccess: (
    ctx: TimelineAccessContext,
    scope: TimelineEntityScope,
  ) => Promise<void>;
};

export type TimelinePublishInput = Omit<TimelineEvent, "id"> & {
  id?: string;
};
