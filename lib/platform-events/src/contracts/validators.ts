import type { PlatformEventType } from "../types/event-types.js";
import type { PlatformEventEnvelope } from "../types/envelope.js";
import { PLATFORM_EVENT_SCHEMA_VERSION } from "../types/envelope.js";
import { PLATFORM_EVENT_TYPES } from "../types/event-types.js";

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, label: string): void {
  if (!isNonEmptyString(obj[key])) {
    throw new EventValidationError(`${label}.${key} must be a non-empty string`);
  }
}

function requireNumber(obj: Record<string, unknown>, key: string, label: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    throw new EventValidationError(`${label}.${key} must be a number`);
  }
}

const PAYLOAD_VALIDATORS: Record<PlatformEventType, (payload: Record<string, unknown>) => void> = {
  CustomerCreated: (p) => {
    requireString(p, "customerId", "CustomerCreated");
    requireString(p, "displayName", "CustomerCreated");
  },
  CustomerUpdated: (p) => {
    requireString(p, "customerId", "CustomerUpdated");
    if (!Array.isArray(p.changedFields)) throw new EventValidationError("CustomerUpdated.changedFields must be an array");
    if (!isObject(p.patch)) throw new EventValidationError("CustomerUpdated.patch must be an object");
  },
  LeadCreated: (p) => {
    requireString(p, "leadId", "LeadCreated");
    requireString(p, "title", "LeadCreated");
  },
  LeadConverted: (p) => {
    requireString(p, "leadId", "LeadConverted");
    requireString(p, "customerId", "LeadConverted");
  },
  BookingCreated: (p) => {
    requireString(p, "bookingId", "BookingCreated");
    requireString(p, "customerId", "BookingCreated");
    requireString(p, "scheduledAt", "BookingCreated");
  },
  BookingConfirmed: (p) => {
    requireString(p, "bookingId", "BookingConfirmed");
    requireString(p, "customerId", "BookingConfirmed");
    requireString(p, "confirmedAt", "BookingConfirmed");
  },
  BookingCancelled: (p) => {
    requireString(p, "bookingId", "BookingCancelled");
    requireString(p, "customerId", "BookingCancelled");
    requireString(p, "cancelledAt", "BookingCancelled");
  },
  BookingCompleted: (p) => {
    requireString(p, "bookingId", "BookingCompleted");
    requireString(p, "customerId", "BookingCompleted");
    requireString(p, "completedAt", "BookingCompleted");
  },
  PaymentCollected: (p) => {
    requireString(p, "paymentId", "PaymentCollected");
    requireString(p, "customerId", "PaymentCollected");
    requireNumber(p, "amountCents", "PaymentCollected");
    requireString(p, "currency", "PaymentCollected");
    requireString(p, "method", "PaymentCollected");
  },
  InvoiceGenerated: (p) => {
    requireString(p, "invoiceId", "InvoiceGenerated");
    requireString(p, "customerId", "InvoiceGenerated");
    requireNumber(p, "amountCents", "InvoiceGenerated");
    requireString(p, "currency", "InvoiceGenerated");
  },
  InvoicePaid: (p) => {
    requireString(p, "invoiceId", "InvoicePaid");
    requireString(p, "customerId", "InvoicePaid");
    requireString(p, "paidAt", "InvoicePaid");
    requireNumber(p, "amountCents", "InvoicePaid");
  },
  TaskAssigned: (p) => {
    requireString(p, "taskId", "TaskAssigned");
    requireString(p, "assigneeId", "TaskAssigned");
    requireString(p, "title", "TaskAssigned");
  },
  TaskCompleted: (p) => {
    requireString(p, "taskId", "TaskCompleted");
    requireString(p, "completedBy", "TaskCompleted");
    requireString(p, "completedAt", "TaskCompleted");
  },
  EmailSent: (p) => {
    requireString(p, "messageId", "EmailSent");
    requireString(p, "recipient", "EmailSent");
    requireString(p, "subject", "EmailSent");
  },
  WhatsAppSent: (p) => {
    requireString(p, "messageId", "WhatsAppSent");
    requireString(p, "recipient", "WhatsAppSent");
    requireString(p, "preview", "WhatsAppSent");
  },
  NotificationCreated: (p) => {
    requireString(p, "notificationId", "NotificationCreated");
    requireString(p, "category", "NotificationCreated");
    requireString(p, "title", "NotificationCreated");
    requireString(p, "recipientId", "NotificationCreated");
    const priority = p.priority;
    if (priority !== "low" && priority !== "normal" && priority !== "high" && priority !== "urgent") {
      throw new EventValidationError("NotificationCreated.priority is invalid");
    }
  },
  WorkflowExecuted: (p) => {
    requireString(p, "workflowId", "WorkflowExecuted");
    requireString(p, "workflowName", "WorkflowExecuted");
    requireString(p, "triggerEventType", "WorkflowExecuted");
    const status = p.status;
    if (status !== "success" && status !== "failed" && status !== "skipped") {
      throw new EventValidationError("WorkflowExecuted.status is invalid");
    }
  },
  AISummaryGenerated: (p) => {
    requireString(p, "summaryId", "AISummaryGenerated");
    requireString(p, "entityType", "AISummaryGenerated");
    requireString(p, "entityId", "AISummaryGenerated");
    requireString(p, "model", "AISummaryGenerated");
  },
  KnowledgeUpdated: (p) => {
    requireString(p, "documentId", "KnowledgeUpdated");
    requireString(p, "title", "KnowledgeUpdated");
    const action = p.action;
    if (action !== "created" && action !== "updated" && action !== "deleted") {
      throw new EventValidationError("KnowledgeUpdated.action is invalid");
    }
  },
  FileUploaded: (p) => {
    requireString(p, "fileId", "FileUploaded");
    requireString(p, "fileName", "FileUploaded");
    requireString(p, "mimeType", "FileUploaded");
    requireNumber(p, "sizeBytes", "FileUploaded");
  },
  PermissionChanged: (p) => {
    requireString(p, "userId", "PermissionChanged");
    requireString(p, "permission", "PermissionChanged");
    requireString(p, "changedBy", "PermissionChanged");
    const action = p.action;
    if (action !== "granted" && action !== "revoked") {
      throw new EventValidationError("PermissionChanged.action is invalid");
    }
  },
  ConfigurationUpdated: (p) => {
    requireString(p, "configurationId", "ConfigurationUpdated");
    requireString(p, "domain", "ConfigurationUpdated");
    requireString(p, "scopeKey", "ConfigurationUpdated");
    requireNumber(p, "version", "ConfigurationUpdated");
    requireString(p, "status", "ConfigurationUpdated");
  },
  ConfigurationPublished: (p) => {
    requireString(p, "configurationId", "ConfigurationPublished");
    requireString(p, "domain", "ConfigurationPublished");
    requireString(p, "scopeKey", "ConfigurationPublished");
    requireNumber(p, "version", "ConfigurationPublished");
  },
  LeadUpdated: (p) => {
    requireString(p, "leadId", "LeadUpdated");
  },
  BookingNoShow: (p) => {
    requireString(p, "bookingId", "BookingNoShow");
    requireString(p, "customerId", "BookingNoShow");
    requireString(p, "markedAt", "BookingNoShow");
  },
  BookingRescheduled: (p) => {
    requireString(p, "bookingId", "BookingRescheduled");
    requireString(p, "customerId", "BookingRescheduled");
    requireString(p, "scheduledAt", "BookingRescheduled");
    requireString(p, "rescheduledAt", "BookingRescheduled");
  },
  TaskCreated: (p) => {
    requireString(p, "taskId", "TaskCreated");
    requireString(p, "title", "TaskCreated");
  },
  RefundCreated: (p) => {
    requireString(p, "refundId", "RefundCreated");
    requireString(p, "paymentId", "RefundCreated");
    requireString(p, "customerId", "RefundCreated");
    requireNumber(p, "amountCents", "RefundCreated");
    requireString(p, "currency", "RefundCreated");
  },
  WorkflowStarted: (p) => {
    requireString(p, "workflowId", "WorkflowStarted");
    requireString(p, "workflowName", "WorkflowStarted");
  },
  WorkflowCompleted: (p) => {
    requireString(p, "workflowId", "WorkflowCompleted");
    requireString(p, "workflowName", "WorkflowCompleted");
  },
  WorkflowCancelled: (p) => {
    requireString(p, "workflowId", "WorkflowCancelled");
    requireString(p, "workflowName", "WorkflowCancelled");
  },
  FeatureFlagUpdated: (p) => {
    requireString(p, "featureKey", "FeatureFlagUpdated");
    requireString(p, "scopeType", "FeatureFlagUpdated");
  },
  LicenseChanged: (p) => {
    requireString(p, "planCode", "LicenseChanged");
    requireString(p, "status", "LicenseChanged");
  },
  EmployeeAssigned: (p) => {
    requireString(p, "employeeId", "EmployeeAssigned");
    requireString(p, "bookingId", "EmployeeAssigned");
    requireString(p, "customerId", "EmployeeAssigned");
  },
  ConversationTransferred: (p) => {
    requireString(p, "conversationId", "ConversationTransferred");
    requireString(p, "fromOwnerType", "ConversationTransferred");
    requireString(p, "toOwnerType", "ConversationTransferred");
    requireString(p, "reason", "ConversationTransferred");
  },
  ConversationStarted: (p) => {
    requireString(p, "companyId", "ConversationStarted");
    requireString(p, "conversationId", "ConversationStarted");
    requireString(p, "channelType", "ConversationStarted");
    requireString(p, "createdAt", "ConversationStarted");
  },
  ConversationMessageReceived: (p) => {
    requireString(p, "companyId", "ConversationMessageReceived");
    requireString(p, "conversationId", "ConversationMessageReceived");
    requireString(p, "messageId", "ConversationMessageReceived");
    requireString(p, "receivedAt", "ConversationMessageReceived");
  },
  LeadIntelligenceUpdated: (p) => {
    requireString(p, "companyId", "LeadIntelligenceUpdated");
    requireString(p, "leadId", "LeadIntelligenceUpdated");
    requireString(p, "conversationId", "LeadIntelligenceUpdated");
    requireString(p, "captureState", "LeadIntelligenceUpdated");
    requireString(p, "identityStatus", "LeadIntelligenceUpdated");
    if (typeof p.created !== "boolean") {
      throw new EventValidationError("LeadIntelligenceUpdated.created must be a boolean");
    }
    if (typeof p.contextReady !== "boolean") {
      throw new EventValidationError("LeadIntelligenceUpdated.contextReady must be a boolean");
    }
    if (p.confidence !== null && typeof p.confidence !== "number") {
      throw new EventValidationError("LeadIntelligenceUpdated.confidence must be a number or null");
    }
  },
  LeadAnalysisRequested: (p) => {
    requireString(p, "companyId", "LeadAnalysisRequested");
    requireString(p, "leadId", "LeadAnalysisRequested");
    requireString(p, "conversationId", "LeadAnalysisRequested");
    requireString(p, "reason", "LeadAnalysisRequested");
    requireNumber(p, "messageCount", "LeadAnalysisRequested");
    if (!Array.isArray(p.contextSignals)) {
      throw new EventValidationError("LeadAnalysisRequested.contextSignals must be an array");
    }
    if (p.confidence !== null && typeof p.confidence !== "number") {
      throw new EventValidationError("LeadAnalysisRequested.confidence must be a number or null");
    }
  },
  OpportunityCreated: (p) => {
    requireString(p, "opportunityId", "OpportunityCreated");
    requireString(p, "name", "OpportunityCreated");
    requireString(p, "companyId", "OpportunityCreated");
  },
  OpportunityStageChanged: (p) => {
    requireString(p, "opportunityId", "OpportunityStageChanged");
    requireString(p, "fromStageId", "OpportunityStageChanged");
    requireString(p, "toStageId", "OpportunityStageChanged");
    requireString(p, "stageKey", "OpportunityStageChanged");
    requireString(p, "companyId", "OpportunityStageChanged");
  },
  OpportunityProbabilityChanged: (p) => {
    requireString(p, "opportunityId", "OpportunityProbabilityChanged");
    requireNumber(p, "previousPercent", "OpportunityProbabilityChanged");
    requireNumber(p, "nextPercent", "OpportunityProbabilityChanged");
    requireString(p, "source", "OpportunityProbabilityChanged");
    requireString(p, "companyId", "OpportunityProbabilityChanged");
  },
  OpportunityProductsAdded: (p) => {
    requireString(p, "opportunityId", "OpportunityProductsAdded");
    requireString(p, "companyId", "OpportunityProductsAdded");
    if (!Array.isArray(p.productIds)) {
      throw new EventValidationError("OpportunityProductsAdded.productIds must be an array");
    }
  },
  OpportunityQuoteCreated: (p) => {
    requireString(p, "opportunityId", "OpportunityQuoteCreated");
    requireString(p, "quoteId", "OpportunityQuoteCreated");
    requireString(p, "companyId", "OpportunityQuoteCreated");
  },
  OpportunityNegotiationStarted: (p) => {
    requireString(p, "opportunityId", "OpportunityNegotiationStarted");
    requireString(p, "companyId", "OpportunityNegotiationStarted");
  },
  OpportunityWon: (p) => {
    requireString(p, "opportunityId", "OpportunityWon");
    requireString(p, "companyId", "OpportunityWon");
  },
  OpportunityLost: (p) => {
    requireString(p, "opportunityId", "OpportunityLost");
    requireString(p, "companyId", "OpportunityLost");
  },
  ProductCreated: (p) => {
    requireString(p, "productId", "ProductCreated");
    requireString(p, "name", "ProductCreated");
    requireString(p, "sku", "ProductCreated");
    requireString(p, "productType", "ProductCreated");
    requireString(p, "companyId", "ProductCreated");
  },
  ProductUpdated: (p) => {
    requireString(p, "productId", "ProductUpdated");
    requireString(p, "companyId", "ProductUpdated");
    if (!Array.isArray(p.changedFields)) {
      throw new EventValidationError("ProductUpdated.changedFields must be an array");
    }
  },
  ProductArchived: (p) => {
    requireString(p, "productId", "ProductArchived");
    requireString(p, "companyId", "ProductArchived");
  },
  PriceChanged: (p) => {
    requireString(p, "productId", "PriceChanged");
    requireNumber(p, "previousPrice", "PriceChanged");
    requireNumber(p, "nextPrice", "PriceChanged");
    requireString(p, "currency", "PriceChanged");
    requireString(p, "companyId", "PriceChanged");
  },
  CategoryChanged: (p) => {
    requireString(p, "productId", "CategoryChanged");
    requireString(p, "companyId", "CategoryChanged");
  },
  QuoteCreated: (p) => {
    requireString(p, "quoteId", "QuoteCreated");
    requireString(p, "quoteNumber", "QuoteCreated");
    requireString(p, "companyId", "QuoteCreated");
  },
  QuoteUpdated: (p) => {
    requireString(p, "quoteId", "QuoteUpdated");
    requireString(p, "companyId", "QuoteUpdated");
    if (!Array.isArray(p.changedFields)) {
      throw new EventValidationError("QuoteUpdated.changedFields must be an array");
    }
  },
  QuoteSent: (p) => {
    requireString(p, "quoteId", "QuoteSent");
    requireString(p, "companyId", "QuoteSent");
  },
  QuoteViewed: (p) => {
    requireString(p, "quoteId", "QuoteViewed");
    requireString(p, "companyId", "QuoteViewed");
  },
  QuoteAccepted: (p) => {
    requireString(p, "quoteId", "QuoteAccepted");
    requireString(p, "companyId", "QuoteAccepted");
  },
  QuoteRejected: (p) => {
    requireString(p, "quoteId", "QuoteRejected");
    requireString(p, "companyId", "QuoteRejected");
  },
  QuoteExpired: (p) => {
    requireString(p, "quoteId", "QuoteExpired");
    requireString(p, "companyId", "QuoteExpired");
  },
  QuoteVersionCreated: (p) => {
    requireString(p, "quoteId", "QuoteVersionCreated");
    requireString(p, "previousQuoteId", "QuoteVersionCreated");
    requireNumber(p, "versionNumber", "QuoteVersionCreated");
    requireString(p, "companyId", "QuoteVersionCreated");
  },
};

export function validatePlatformEventEnvelope(
  envelope: PlatformEventEnvelope<string, unknown>,
): asserts envelope is PlatformEventEnvelope<PlatformEventType, unknown> {
  if (!isNonEmptyString(envelope.eventId)) {
    throw new EventValidationError("eventId is required");
  }
  if (!PLATFORM_EVENT_TYPES.includes(envelope.eventType as PlatformEventType)) {
    throw new EventValidationError(`Unknown event type: ${envelope.eventType}`);
  }
  if (envelope.schemaVersion !== PLATFORM_EVENT_SCHEMA_VERSION) {
    throw new EventValidationError(
      `Unsupported schema version: ${envelope.schemaVersion}. Expected ${PLATFORM_EVENT_SCHEMA_VERSION}`,
    );
  }
  if (!isNonEmptyString(envelope.tenantId)) {
    throw new EventValidationError("tenantId is required");
  }
  if (!isNonEmptyString(envelope.sourceModule)) {
    throw new EventValidationError("sourceModule is required");
  }
  if (!isNonEmptyString(envelope.correlationId)) {
    throw new EventValidationError("correlationId is required");
  }
  if (!isObject(envelope.payload)) {
    throw new EventValidationError("payload must be an object");
  }

  PAYLOAD_VALIDATORS[envelope.eventType as PlatformEventType](envelope.payload as Record<string, unknown>);
}

export function validatePayload<T extends PlatformEventType>(
  eventType: T,
  payload: unknown,
): asserts payload is import("../types/event-types.js").PlatformEventMap[T] {
  if (!isObject(payload)) {
    throw new EventValidationError(`${eventType} payload must be an object`);
  }
  PAYLOAD_VALIDATORS[eventType](payload);
}
