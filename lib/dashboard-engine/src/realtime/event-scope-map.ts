import type { DashboardRealtimeEventType, DashboardRefreshScope } from "./realtime-event-types.js";

const EVENT_SCOPE_MAP: Record<DashboardRealtimeEventType, DashboardRefreshScope> = {
  customer_created: { providerIds: ["crm"], categories: ["crm"], eventTypes: ["customer_created"] },
  customer_updated: { providerIds: ["crm"], categories: ["crm"], eventTypes: ["customer_updated"] },
  customer_deleted: { providerIds: ["crm"], categories: ["crm"], eventTypes: ["customer_deleted"] },
  lead_converted: { providerIds: ["crm"], categories: ["crm", "sales"], eventTypes: ["lead_converted"] },
  invoice_created: { providerIds: ["finance", "invoices"], categories: ["finance"], eventTypes: ["invoice_created"] },
  invoice_paid: { providerIds: ["finance", "invoices"], categories: ["finance"], eventTypes: ["invoice_paid"] },
  invoice_overdue: { providerIds: ["finance", "invoices"], categories: ["finance"], eventTypes: ["invoice_overdue"] },
  payment_received: { providerIds: ["finance", "invoices"], categories: ["finance"], eventTypes: ["payment_received"] },
  booking_created: { providerIds: ["bookings"], categories: ["system"], eventTypes: ["booking_created"] },
  booking_updated: { providerIds: ["bookings"], categories: ["system"], eventTypes: ["booking_updated"] },
  booking_cancelled: { providerIds: ["bookings"], categories: ["system"], eventTypes: ["booking_cancelled"] },
  conversation_started: { providerIds: ["support"], categories: ["support"], eventTypes: ["conversation_started"] },
  conversation_closed: { providerIds: ["support"], categories: ["support"], eventTypes: ["conversation_closed"] },
  conversation_escalated: { providerIds: ["support"], categories: ["support"], eventTypes: ["conversation_escalated"] },
  workflow_started: { providerIds: ["automation"], categories: ["automation"], eventTypes: ["workflow_started"] },
  workflow_completed: { providerIds: ["automation"], categories: ["automation"], eventTypes: ["workflow_completed"] },
  workflow_failed: { providerIds: ["automation"], categories: ["automation"], eventTypes: ["workflow_failed"] },
  ai_conversation_started: { providerIds: ["ai"], categories: ["ai"], eventTypes: ["ai_conversation_started"] },
  ai_conversation_finished: { providerIds: ["ai"], categories: ["ai"], eventTypes: ["ai_conversation_finished"] },
  tool_execution: { providerIds: ["ai"], categories: ["ai"], eventTypes: ["tool_execution"] },
  knowledge_updated: { providerIds: ["knowledge"], categories: ["knowledge"], eventTypes: ["knowledge_updated"] },
  embedding_created: { providerIds: ["knowledge"], categories: ["knowledge"], eventTypes: ["embedding_created"] },
  retrieval_completed: { providerIds: ["knowledge"], categories: ["knowledge"], eventTypes: ["retrieval_completed"] },
  whatsapp_message: { providerIds: ["channels"], categories: ["channels"], eventTypes: ["whatsapp_message"] },
  email_received: { providerIds: ["channels"], categories: ["channels"], eventTypes: ["email_received"] },
  messenger_message: { providerIds: ["channels"], categories: ["channels"], eventTypes: ["messenger_message"] },
  instagram_message: { providerIds: ["channels"], categories: ["channels"], eventTypes: ["instagram_message"] },
  heartbeat: { providerIds: [], categories: [], eventTypes: ["heartbeat"] },
  reconnect: { providerIds: [], categories: [], eventTypes: ["reconnect"] },
};

export function resolveRefreshScope(eventType: DashboardRealtimeEventType): DashboardRefreshScope {
  return EVENT_SCOPE_MAP[eventType];
}

export function mergeRefreshScopes(scopes: DashboardRefreshScope[]): DashboardRefreshScope {
  const providerIds = new Set<string>();
  const categories = new Set<string>();
  const eventTypes = new Set<DashboardRealtimeEventType>();

  for (const scope of scopes) {
    for (const providerId of scope.providerIds) providerIds.add(providerId);
    for (const category of scope.categories) categories.add(category);
    for (const eventType of scope.eventTypes) eventTypes.add(eventType);
  }

  return {
    providerIds: [...providerIds],
    categories: [...categories],
    eventTypes: [...eventTypes],
  };
}

export const PROVIDER_METRIC_PREFIXES: Record<string, string> = {
  crm: "crm.",
  support: "support.",
  ai: "ai.",
  automation: "automation.",
  knowledge: "knowledge.",
  channels: "channels.",
  finance: "finance.",
  invoices: "invoices.",
  bookings: "bookings.",
};

export function providerOwnsMetric(providerId: string, metricKey: string): boolean {
  const prefix = PROVIDER_METRIC_PREFIXES[providerId];
  if (!prefix) return false;
  return metricKey.startsWith(prefix);
}

export function filterProviderIdsByPermission(
  providerIds: string[],
  allowedProviderIds: Set<string>,
): string[] {
  return providerIds.filter((providerId) => allowedProviderIds.has(providerId));
}
