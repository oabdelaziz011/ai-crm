import type { PlatformEventType } from "../types/event-types.js";

export type EventContractDefinition = {
  eventType: PlatformEventType;
  schemaVersion: 1;
  description: string;
  publisherModule: string;
  subscribers: string[];
  payloadFields: string[];
};

export const PLATFORM_EVENT_REGISTRY: EventContractDefinition[] = [
  { eventType: "CustomerCreated", schemaVersion: 1, description: "A new customer record was created.", publisherModule: "crm", subscribers: ["audit", "timeline", "dashboard", "notification", "ai"], payloadFields: ["customerId", "displayName", "email?", "phone?"] },
  { eventType: "CustomerUpdated", schemaVersion: 1, description: "An existing customer record was updated.", publisherModule: "crm", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["customerId", "changedFields", "patch"] },
  { eventType: "LeadCreated", schemaVersion: 1, description: "A new lead was captured.", publisherModule: "leads", subscribers: ["audit", "timeline", "dashboard", "workflow"], payloadFields: ["leadId", "title", "source?"] },
  { eventType: "LeadConverted", schemaVersion: 1, description: "A lead was converted to a customer.", publisherModule: "leads", subscribers: ["audit", "timeline", "crm", "dashboard", "notification"], payloadFields: ["leadId", "customerId", "convertedBy?"] },
  { eventType: "BookingCreated", schemaVersion: 1, description: "A booking was scheduled.", publisherModule: "booking", subscribers: ["audit", "timeline", "notification", "workflow"], payloadFields: ["bookingId", "customerId", "scheduledAt", "serviceId?"] },
  { eventType: "BookingConfirmed", schemaVersion: 1, description: "A booking was confirmed.", publisherModule: "booking", subscribers: ["audit", "timeline", "notification"], payloadFields: ["bookingId", "customerId", "confirmedAt"] },
  { eventType: "BookingCancelled", schemaVersion: 1, description: "A booking was cancelled.", publisherModule: "booking", subscribers: ["audit", "timeline", "notification", "workflow"], payloadFields: ["bookingId", "customerId", "reason?", "cancelledAt"] },
  { eventType: "BookingCompleted", schemaVersion: 1, description: "A booking was completed.", publisherModule: "booking", subscribers: ["audit", "timeline", "invoice", "payment", "dashboard", "notification", "ai", "reports"], payloadFields: ["bookingId", "customerId", "completedAt"] },
  { eventType: "PaymentCollected", schemaVersion: 1, description: "A payment was collected.", publisherModule: "payment", subscribers: ["audit", "timeline", "dashboard", "notification", "reports"], payloadFields: ["paymentId", "invoiceId?", "customerId", "amountCents", "currency", "method"] },
  { eventType: "InvoiceGenerated", schemaVersion: 1, description: "An invoice was generated.", publisherModule: "invoice", subscribers: ["audit", "timeline", "notification", "dashboard"], payloadFields: ["invoiceId", "customerId", "amountCents", "currency", "dueAt?"] },
  { eventType: "InvoicePaid", schemaVersion: 1, description: "An invoice was fully paid.", publisherModule: "invoice", subscribers: ["audit", "timeline", "dashboard", "reports"], payloadFields: ["invoiceId", "customerId", "paidAt", "amountCents"] },
  { eventType: "TaskAssigned", schemaVersion: 1, description: "A task was assigned to a user.", publisherModule: "tasks", subscribers: ["audit", "timeline", "notification"], payloadFields: ["taskId", "assigneeId", "title", "entityType?", "entityId?"] },
  { eventType: "TaskCompleted", schemaVersion: 1, description: "A task was marked complete.", publisherModule: "tasks", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["taskId", "completedBy", "completedAt"] },
  { eventType: "EmailSent", schemaVersion: 1, description: "An email message was sent.", publisherModule: "communication", subscribers: ["audit", "timeline"], payloadFields: ["messageId", "recipient", "subject", "customerId?"] },
  { eventType: "WhatsAppSent", schemaVersion: 1, description: "A WhatsApp message was sent.", publisherModule: "communication", subscribers: ["audit", "timeline"], payloadFields: ["messageId", "recipient", "preview", "customerId?"] },
  { eventType: "NotificationCreated", schemaVersion: 1, description: "An in-app notification was created.", publisherModule: "notification", subscribers: ["audit", "workspace"], payloadFields: ["notificationId", "category", "title", "recipientId", "priority"] },
  { eventType: "WorkflowExecuted", schemaVersion: 1, description: "An automation workflow ran.", publisherModule: "workflow", subscribers: ["audit", "timeline", "reports"], payloadFields: ["workflowId", "workflowName", "triggerEventType", "status"] },
  { eventType: "AISummaryGenerated", schemaVersion: 1, description: "An AI summary was generated.", publisherModule: "ai", subscribers: ["audit", "timeline", "workspace"], payloadFields: ["summaryId", "entityType", "entityId", "model", "tokenCount?"] },
  { eventType: "KnowledgeUpdated", schemaVersion: 1, description: "A knowledge document changed.", publisherModule: "knowledge", subscribers: ["audit", "ai"], payloadFields: ["documentId", "action", "title"] },
  { eventType: "FileUploaded", schemaVersion: 1, description: "A file was uploaded.", publisherModule: "files", subscribers: ["audit", "timeline"], payloadFields: ["fileId", "fileName", "mimeType", "sizeBytes", "entityType?", "entityId?"] },
  { eventType: "ConfigurationUpdated", schemaVersion: 1, description: "Configuration draft or rollback occurred.", publisherModule: "configuration", subscribers: ["audit", "timeline", "workspace"], payloadFields: ["configurationId", "domain", "scopeKey", "version", "status"] },
  { eventType: "ConfigurationPublished", schemaVersion: 1, description: "Configuration was published.", publisherModule: "configuration", subscribers: ["audit", "timeline", "workspace", "dashboard", "notification"], payloadFields: ["configurationId", "domain", "scopeKey", "version"] },
  { eventType: "PermissionChanged", schemaVersion: 1, description: "A user permission was changed.", publisherModule: "identity", subscribers: ["audit"], payloadFields: ["userId", "permission", "action", "changedBy"] },
];

export function getEventContract(eventType: PlatformEventType): EventContractDefinition | undefined {
  return PLATFORM_EVENT_REGISTRY.find((e) => e.eventType === eventType);
}

export function isRegisteredPlatformEventType(value: string): value is PlatformEventType {
  return PLATFORM_EVENT_REGISTRY.some((e) => e.eventType === value);
}

export function listSubscribersForEvent(eventType: PlatformEventType): string[] {
  return getEventContract(eventType)?.subscribers ?? [];
}
