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
  { eventType: "ConversationStarted", schemaVersion: 1, description: "A brand-new conversation was created.", publisherModule: "conversation", subscribers: ["audit", "timeline", "lead_intelligence"], payloadFields: ["companyId", "conversationId", "channelType", "externalUserId?", "externalThreadId?", "phone?", "email?", "actorUserId?", "createdAt"] },
  { eventType: "ConversationMessageReceived", schemaVersion: 1, description: "A new inbound conversation message was received.", publisherModule: "conversation", subscribers: ["audit", "lead_intelligence"], payloadFields: ["companyId", "conversationId", "messageId", "channelType?", "contentPreview?", "messageCount?", "actorUserId?", "receivedAt"] },
  { eventType: "LeadIntelligenceUpdated", schemaVersion: 1, description: "Smart Lead Capture updated prospect/lead intelligence state.", publisherModule: "lead_intelligence", subscribers: ["audit", "timeline", "workspace"], payloadFields: ["companyId", "leadId", "conversationId", "captureState", "identityStatus", "created", "contextReady", "confidence"] },
  { eventType: "LeadAnalysisRequested", schemaVersion: 1, description: "Context threshold met; AI analysis pipeline runs (Sprint 3.12.2).", publisherModule: "lead_intelligence", subscribers: ["audit", "lead_intelligence"], payloadFields: ["companyId", "leadId", "conversationId", "reason", "messageCount", "contextSignals", "confidence"] },
  { eventType: "OpportunityCreated", schemaVersion: 1, description: "A sales opportunity was created.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "dashboard", "workspace"], payloadFields: ["opportunityId", "name", "leadId?", "companyId"] },
  { eventType: "OpportunityStageChanged", schemaVersion: 1, description: "Opportunity pipeline stage changed.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["opportunityId", "fromStageId", "toStageId", "stageKey", "companyId"] },
  { eventType: "OpportunityProbabilityChanged", schemaVersion: 1, description: "Opportunity win probability changed.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["opportunityId", "previousPercent", "nextPercent", "source", "companyId"] },
  { eventType: "OpportunityProductsAdded", schemaVersion: 1, description: "Products were added to an opportunity (future catalog).", publisherModule: "opportunities", subscribers: ["audit", "timeline"], payloadFields: ["opportunityId", "productIds", "companyId"] },
  { eventType: "OpportunityQuoteCreated", schemaVersion: 1, description: "A quote was created for an opportunity (future quote builder).", publisherModule: "opportunities", subscribers: ["audit", "timeline"], payloadFields: ["opportunityId", "quoteId", "companyId"] },
  { eventType: "OpportunityNegotiationStarted", schemaVersion: 1, description: "Opportunity entered negotiation.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "notification"], payloadFields: ["opportunityId", "companyId"] },
  { eventType: "OpportunityWon", schemaVersion: 1, description: "Opportunity was won.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "dashboard", "notification"], payloadFields: ["opportunityId", "companyId"] },
  { eventType: "OpportunityLost", schemaVersion: 1, description: "Opportunity was lost.", publisherModule: "opportunities", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["opportunityId", "companyId", "reason?"] },
  { eventType: "ProductCreated", schemaVersion: 1, description: "A catalog product was created.", publisherModule: "products", subscribers: ["audit", "timeline", "workspace"], payloadFields: ["productId", "name", "sku", "productType", "companyId"] },
  { eventType: "ProductUpdated", schemaVersion: 1, description: "A catalog product was updated.", publisherModule: "products", subscribers: ["audit", "timeline"], payloadFields: ["productId", "changedFields", "companyId"] },
  { eventType: "ProductArchived", schemaVersion: 1, description: "A catalog product was archived.", publisherModule: "products", subscribers: ["audit", "timeline"], payloadFields: ["productId", "companyId"] },
  { eventType: "PriceChanged", schemaVersion: 1, description: "A catalog product base price changed.", publisherModule: "products", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["productId", "previousPrice", "nextPrice", "currency", "companyId"] },
  { eventType: "CategoryChanged", schemaVersion: 1, description: "A catalog product category changed.", publisherModule: "products", subscribers: ["audit", "timeline"], payloadFields: ["productId", "previousCategoryId?", "nextCategoryId?", "companyId"] },
  { eventType: "QuoteCreated", schemaVersion: 1, description: "A sales quote was created.", publisherModule: "quotes", subscribers: ["audit", "timeline", "workspace"], payloadFields: ["quoteId", "quoteNumber", "opportunityId?", "companyId"] },
  { eventType: "QuoteUpdated", schemaVersion: 1, description: "A sales quote was updated.", publisherModule: "quotes", subscribers: ["audit", "timeline"], payloadFields: ["quoteId", "changedFields", "companyId"] },
  { eventType: "QuoteSent", schemaVersion: 1, description: "A quote was marked sent.", publisherModule: "quotes", subscribers: ["audit", "timeline", "notification"], payloadFields: ["quoteId", "companyId"] },
  { eventType: "QuoteViewed", schemaVersion: 1, description: "A quote was viewed.", publisherModule: "quotes", subscribers: ["audit", "timeline"], payloadFields: ["quoteId", "companyId"] },
  { eventType: "QuoteAccepted", schemaVersion: 1, description: "A quote was accepted.", publisherModule: "quotes", subscribers: ["audit", "timeline", "dashboard", "notification"], payloadFields: ["quoteId", "companyId"] },
  { eventType: "QuoteRejected", schemaVersion: 1, description: "A quote was rejected.", publisherModule: "quotes", subscribers: ["audit", "timeline", "dashboard"], payloadFields: ["quoteId", "companyId"] },
  { eventType: "QuoteExpired", schemaVersion: 1, description: "A quote expired.", publisherModule: "quotes", subscribers: ["audit", "timeline"], payloadFields: ["quoteId", "companyId"] },
  { eventType: "QuoteVersionCreated", schemaVersion: 1, description: "A new quote version was created.", publisherModule: "quotes", subscribers: ["audit", "timeline"], payloadFields: ["quoteId", "previousQuoteId", "versionNumber", "companyId"] },
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
