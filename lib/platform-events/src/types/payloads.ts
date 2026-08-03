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
