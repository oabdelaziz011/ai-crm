export const DASHBOARD_REALTIME_MODULES = [
  "crm",
  "finance",
  "bookings",
  "support",
  "automation",
  "ai",
  "knowledge",
  "channels",
] as const;

export type DashboardRealtimeModule = (typeof DASHBOARD_REALTIME_MODULES)[number];

export const DASHBOARD_REALTIME_EVENT_TYPES = [
  "customer_created",
  "customer_updated",
  "customer_deleted",
  "lead_converted",
  "invoice_created",
  "invoice_paid",
  "invoice_overdue",
  "payment_received",
  "booking_created",
  "booking_updated",
  "booking_cancelled",
  "conversation_started",
  "conversation_closed",
  "conversation_escalated",
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "ai_conversation_started",
  "ai_conversation_finished",
  "tool_execution",
  "knowledge_updated",
  "embedding_created",
  "retrieval_completed",
  "whatsapp_message",
  "email_received",
  "messenger_message",
  "instagram_message",
  "heartbeat",
  "reconnect",
] as const;

export type DashboardRealtimeEventType = (typeof DASHBOARD_REALTIME_EVENT_TYPES)[number];

export type DashboardRealtimeEvent = {
  id: string;
  type: DashboardRealtimeEventType;
  module: DashboardRealtimeModule;
  companyId: string;
  occurredAt: string;
  source?: string;
  payload?: Record<string, string | number | boolean | null>;
};

export type DashboardRealtimeConnectionState = "connected" | "disconnected" | "reconnecting";

export type DashboardRefreshScope = {
  providerIds: string[];
  categories: string[];
  eventTypes: DashboardRealtimeEventType[];
};

export type DashboardRefreshSignal = {
  companyId: string;
  scope: DashboardRefreshScope;
  reason: string;
  scheduledAt: string;
  eventCount: number;
};

export type DashboardRealtimeEngineOptions = {
  debounceMs?: number;
  throttleMs?: number;
  batchWindowMs?: number;
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  maxReconnectAttempts?: number;
  isDocumentVisible?: () => boolean;
};

export const DEFAULT_REALTIME_ENGINE_OPTIONS: Required<
  Pick<
    DashboardRealtimeEngineOptions,
    | "debounceMs"
    | "throttleMs"
    | "batchWindowMs"
    | "heartbeatIntervalMs"
    | "reconnectBaseDelayMs"
    | "reconnectMaxDelayMs"
    | "maxReconnectAttempts"
  >
> = {
  debounceMs: 400,
  throttleMs: 2_000,
  batchWindowMs: 300,
  heartbeatIntervalMs: 30_000,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  maxReconnectAttempts: 8,
};

export type DashboardRealtimeSubscription = {
  companyId: string;
  unsubscribe: () => void;
};
