export type CustomerCreatedPayload = {
  customerId: string;
  displayName: string;
  email?: string;
  phone?: string;
};

export type CustomerUpdatedPayload = {
  customerId: string;
  changedFields: string[];
  patch: Record<string, unknown>;
};

export type LeadCreatedPayload = {
  leadId: string;
  title: string;
  source?: string;
};

export type LeadConvertedPayload = {
  leadId: string;
  customerId: string;
  convertedBy?: string;
};

export type BookingCreatedPayload = {
  bookingId: string;
  customerId: string;
  scheduledAt: string;
  serviceId?: string;
};

export type BookingConfirmedPayload = {
  bookingId: string;
  customerId: string;
  confirmedAt: string;
};

export type BookingCancelledPayload = {
  bookingId: string;
  customerId: string;
  reason?: string;
  cancelledAt: string;
};

export type BookingCompletedPayload = {
  bookingId: string;
  customerId: string;
  completedAt: string;
};

export type PaymentCollectedPayload = {
  paymentId: string;
  invoiceId?: string;
  customerId: string;
  amountCents: number;
  currency: string;
  method: string;
};

export type InvoiceGeneratedPayload = {
  invoiceId: string;
  customerId: string;
  amountCents: number;
  currency: string;
  dueAt?: string;
};

export type InvoicePaidPayload = {
  invoiceId: string;
  customerId: string;
  paidAt: string;
  amountCents: number;
};

export type TaskAssignedPayload = {
  taskId: string;
  assigneeId: string;
  title: string;
  entityType?: string;
  entityId?: string;
};

export type TaskCompletedPayload = {
  taskId: string;
  completedBy: string;
  completedAt: string;
};

export type EmailSentPayload = {
  messageId: string;
  recipient: string;
  subject: string;
  customerId?: string;
};

export type WhatsAppSentPayload = {
  messageId: string;
  recipient: string;
  preview: string;
  customerId?: string;
};

export type NotificationCreatedPayload = {
  notificationId: string;
  category: string;
  title: string;
  recipientId: string;
  priority: "low" | "normal" | "high" | "urgent";
};

export type WorkflowExecutedPayload = {
  workflowId: string;
  workflowName: string;
  triggerEventType: string;
  status: "success" | "failed" | "skipped";
};

export type AISummaryGeneratedPayload = {
  summaryId: string;
  entityType: string;
  entityId: string;
  model: string;
  tokenCount?: number;
};

export type KnowledgeUpdatedPayload = {
  documentId: string;
  action: "created" | "updated" | "deleted";
  title: string;
};

export type FileUploadedPayload = {
  fileId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  entityType?: string;
  entityId?: string;
};

export type PermissionChangedPayload = {
  userId: string;
  permission: string;
  action: "granted" | "revoked";
  changedBy: string;
};

export type ConfigurationUpdatedPayload = {
  configurationId: string;
  domain: string;
  scopeKey: string;
  version: number;
  status: string;
};

export type ConfigurationPublishedPayload = {
  configurationId: string;
  domain: string;
  scopeKey: string;
  version: number;
};

export type LeadUpdatedPayload = {
  leadId: string;
  changedFields: string[];
  patch: Record<string, unknown>;
};

export type BookingNoShowPayload = {
  bookingId: string;
  customerId: string;
  markedAt: string;
  gracePeriodMinutes?: number;
};

export type BookingRescheduledPayload = {
  bookingId: string;
  customerId: string;
  scheduledAt: string;
  rescheduledAt: string;
};

export type TaskCreatedPayload = {
  taskId: string;
  title: string;
  assigneeId?: string;
  entityType?: string;
  entityId?: string;
};

export type RefundCreatedPayload = {
  refundId: string;
  paymentId: string;
  customerId: string;
  amountCents: number;
  currency: string;
};

export type WorkflowStartedPayload = {
  workflowId: string;
  workflowName: string;
  triggerEventType: string;
};

export type WorkflowCompletedPayload = {
  workflowId: string;
  workflowName: string;
  status: "success" | "failed" | "skipped";
};

export type WorkflowCancelledPayload = {
  workflowId: string;
  workflowName: string;
  reason?: string;
};

export type FeatureFlagUpdatedPayload = {
  featureKey: string;
  scopeType: string;
  scopeId?: string | null;
  enabled: boolean;
};

export type LicenseChangedPayload = {
  planCode: string;
  status: string;
  previousPlanCode?: string;
};

export type EmployeeAssignedPayload = {
  employeeId: string;
  bookingId: string;
  customerId: string;
};

export type ConversationTransferredPayload = {
  conversationId: string;
  fromOwnerType: string;
  toOwnerType: string;
  reason: string;
};

/** Published once when a brand-new conversation row is created. */
export type ConversationStartedPayload = {
  companyId: string;
  conversationId: string;
  channelType: string;
  externalUserId?: string | null;
  externalThreadId?: string | null;
  phone?: string | null;
  email?: string | null;
  actorUserId?: string | null;
  createdAt: string;
};

/** Published for each new inbound message (not reused/idempotent duplicates). */
export type ConversationMessageReceivedPayload = {
  companyId: string;
  conversationId: string;
  messageId: string;
  channelType?: string | null;
  contentPreview?: string | null;
  messageCount?: number | null;
  actorUserId?: string | null;
  receivedAt: string;
};

/** Published after Smart Lead Capture resolves/links a prospect or lead. */
export type LeadIntelligenceUpdatedPayload = {
  companyId: string;
  leadId: string;
  conversationId: string;
  captureState: string;
  identityStatus: string;
  created: boolean;
  contextReady: boolean;
  /** null during capture-only updates; number after 3.12.2 analysis. */
  confidence: number | null;
};

/**
 * Published when context threshold is met.
 * AI analysis consumers belong to Sprint 3.12.2 — no analysis in 3.12.1.
 */
export type LeadAnalysisRequestedPayload = {
  companyId: string;
  leadId: string;
  conversationId: string;
  reason: "context_threshold";
  messageCount: number;
  contextSignals: string[];
  confidence: null;
};

/** Sprint 4.0 — Sales Execution Platform */
export type OpportunityCreatedPayload = {
  opportunityId: string;
  name: string;
  leadId?: string | null;
  companyId: string;
};

export type OpportunityStageChangedPayload = {
  opportunityId: string;
  fromStageId: string;
  toStageId: string;
  stageKey: string;
  companyId: string;
};

export type OpportunityProbabilityChangedPayload = {
  opportunityId: string;
  previousPercent: number;
  nextPercent: number;
  source: string;
  companyId: string;
};

export type OpportunityProductsAddedPayload = {
  opportunityId: string;
  productIds: string[];
  companyId: string;
};

export type OpportunityQuoteCreatedPayload = {
  opportunityId: string;
  quoteId: string;
  companyId: string;
};

export type OpportunityNegotiationStartedPayload = {
  opportunityId: string;
  companyId: string;
};

export type OpportunityWonPayload = {
  opportunityId: string;
  companyId: string;
};

export type OpportunityLostPayload = {
  opportunityId: string;
  companyId: string;
  reason?: string | null;
};

/** Sprint 4.1 — Product & Service Catalog */
export type ProductCreatedPayload = {
  productId: string;
  name: string;
  sku: string;
  productType: string;
  companyId: string;
};

export type ProductUpdatedPayload = {
  productId: string;
  changedFields: string[];
  companyId: string;
};

export type ProductArchivedPayload = {
  productId: string;
  companyId: string;
};

export type PriceChangedPayload = {
  productId: string;
  previousPrice: number;
  nextPrice: number;
  currency: string;
  companyId: string;
};

export type CategoryChangedPayload = {
  productId: string;
  previousCategoryId?: string | null;
  nextCategoryId?: string | null;
  companyId: string;
};

/** Sprint 4.2 — Enterprise Quote Builder */
export type QuoteCreatedPayload = {
  quoteId: string;
  quoteNumber: string;
  opportunityId?: string | null;
  companyId: string;
};

export type QuoteUpdatedPayload = {
  quoteId: string;
  changedFields: string[];
  companyId: string;
};

export type QuoteSentPayload = {
  quoteId: string;
  companyId: string;
};

export type QuoteViewedPayload = {
  quoteId: string;
  companyId: string;
};

export type QuoteAcceptedPayload = {
  quoteId: string;
  companyId: string;
};

export type QuoteRejectedPayload = {
  quoteId: string;
  companyId: string;
};

export type QuoteExpiredPayload = {
  quoteId: string;
  companyId: string;
};

export type QuoteVersionCreatedPayload = {
  quoteId: string;
  previousQuoteId: string;
  versionNumber: number;
  companyId: string;
};
