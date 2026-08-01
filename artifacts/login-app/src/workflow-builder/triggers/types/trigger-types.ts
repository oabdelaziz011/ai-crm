import type { WorkflowDocument } from "../../core/types";

export type TriggerClassification = "executable" | "configuration_only";

export type TriggerCategory =
  | "messaging"
  | "crm"
  | "bookings"
  | "payments"
  | "api"
  | "scheduling"
  | "system";

export type TriggerCatalogId =
  | "manual"
  | "rest_api"
  | "inbound_message"
  | "whatsapp"
  | "facebook_messenger"
  | "instagram"
  | "email"
  | "customer_created"
  | "customer_updated"
  | "booking_created"
  | "booking_updated"
  | "booking_cancelled"
  | "payment_received"
  | "payment_failed"
  | "schedule"
  | "webhook"
  | "sms"
  | "ticket_created"
  | "ticket_updated"
  | "ticket_closed"
  | "custom_event";

export type TriggerChannel = "whatsapp" | "messenger" | "instagram" | "email" | "sms";

export type TriggerConfiguration = {
  catalogId: TriggerCatalogId;
  channel?: TriggerChannel;
  legacyTriggerType?: string;
  businessEvent?: string | null;
  customEventName?: string;
  cronExpression?: string;
  timezone?: string;
  webhookPath?: string;
  apiAuthHint?: string;
  eventFilters?: Record<string, string>;
};

export type TriggerCatalogEntry = {
  id: TriggerCatalogId;
  category: TriggerCategory;
  classification: TriggerClassification;
  platformTriggerType: WorkflowDocument["triggerType"];
  channel?: TriggerChannel;
  legacyTriggerType?: string;
  businessEvent?: string | null;
  labelKey: string;
  descriptionKey: string;
  requiresChannelBinding?: boolean;
};

export type TriggerPreviewModel = {
  catalogId: TriggerCatalogId;
  classification: TriggerClassification;
  platformTriggerType: WorkflowDocument["triggerType"];
  source: string;
  channel: string | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  variables: Array<{ token: string; label: string; previewValue?: string }>;
};

export type TriggerAnalyticsModel = {
  executions: number;
  failures: number;
  averageLatencyMs: number | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
};

export type TriggerReadinessFactor = {
  id: string;
  labelKey: string;
  satisfied: boolean;
  severity: "error" | "warning" | "info";
};

export type TriggerReadinessModel = {
  score: number;
  classification: TriggerClassification;
  factors: TriggerReadinessFactor[];
};

export type TriggerTestPayload = {
  initialVariables: Record<string, unknown>;
  label: string;
};
