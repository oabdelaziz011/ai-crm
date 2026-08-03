import type { PlatformEventBus } from "@workspace/platform-events";

/** Event publishing port — application layer publishes through this, never directly to bus from UI. */
export type EventPublisherPort = {
  publishBookingCompleted(input: {
    bookingId: string;
    customerId: string;
    completedAt: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishCustomerCreated(input: {
    customerId: string;
    displayName: string;
    email?: string;
    phone?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishLeadConverted(input: {
    leadId: string;
    customerId: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishLeadCreated(input: {
    leadId: string;
    title: string;
    source?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishLeadUpdated(input: {
    leadId: string;
    changedFields: readonly string[];
    patch: Record<string, unknown>;
    context: PublishEventContext;
  }): Promise<string>;

  publishPaymentCollected(input: {
    paymentId: string;
    customerId: string;
    amountCents: number;
    currency: string;
    method: string;
    invoiceId?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishInvoiceGenerated(input: {
    invoiceId: string;
    customerId: string;
    amountCents: number;
    currency: string;
    dueAt?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishBookingCreated(input: {
    bookingId: string;
    customerId: string;
    scheduledAt: string;
    serviceId?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishBookingCancelled(input: {
    bookingId: string;
    customerId: string;
    reason?: string;
    cancelledAt: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishTaskCompleted(input: {
    taskId: string;
    completedBy: string;
    completedAt: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishTaskAssigned(input: {
    taskId: string;
    assigneeId: string;
    title: string;
    entityType?: string;
    entityId?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishTaskCreated(input: {
    taskId: string;
    title: string;
    assigneeId?: string;
    entityType?: string;
    entityId?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishInvoicePaid(input: {
    invoiceId: string;
    customerId: string;
    paidAt: string;
    amountCents: number;
    context: PublishEventContext;
  }): Promise<string>;

  publishBookingNoShow(input: {
    bookingId: string;
    customerId: string;
    markedAt: string;
    gracePeriodMinutes?: number;
    context: PublishEventContext;
  }): Promise<string>;

  publishBookingRescheduled(input: {
    bookingId: string;
    customerId: string;
    scheduledAt: string;
    rescheduledAt: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishConfigurationUpdated(input: {
    configurationId: string;
    domain: string;
    scopeKey: string;
    version: number;
    status: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishConfigurationPublished(input: {
    configurationId: string;
    domain: string;
    scopeKey: string;
    version: number;
    context: PublishEventContext;
  }): Promise<string>;

  publishFileUploaded(input: {
    fileId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    entityType?: string;
    entityId?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishWorkflowExecuted(input: {
    workflowId: string;
    workflowName: string;
    triggerEventType: string;
    status: "success" | "failed" | "skipped";
    context: PublishEventContext;
  }): Promise<string>;

  publishAISummaryGenerated(input: {
    summaryId: string;
    entityType: string;
    entityId: string;
    model: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishCustomerUpdated(input: {
    customerId: string;
    changedFields: readonly string[];
    patch: Record<string, unknown>;
    context: PublishEventContext;
  }): Promise<string>;

  publishKnowledgeUpdated(input: {
    documentId: string;
    title: string;
    action: "created" | "updated" | "published" | "archived";
    context: PublishEventContext;
  }): Promise<string>;

  publishFeatureFlagUpdated(input: {
    featureKey: string;
    scopeType: string;
    scopeId?: string;
    enabled: boolean;
    context: PublishEventContext;
  }): Promise<string>;

  publishLicenseChanged(input: {
    planCode: string;
    status: string;
    previousPlanCode?: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishConversationTransferred(input: {
    conversationId: string;
    fromOwnerType: string;
    toOwnerType: string;
    reason: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishEmployeeAssigned(input: {
    employeeId: string;
    bookingId: string;
    customerId: string;
    context: PublishEventContext;
  }): Promise<string>;

  publishWorkflowStarted(input: {
    workflowId: string;
    workflowName: string;
    triggerEventType?: string;
    context: PublishEventContext;
  }): Promise<string>;
};

export type PublishEventContext = Readonly<{
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  actorType?: "user" | "system" | "ai";
  correlationId: string;
}>;

export type AuditWriterPort = {
  write(entry: AuditWriteInput): Promise<void>;
};

export type AuditWriteInput = Readonly<{
  tenantId: string;
  actorId: string;
  correlationId: string;
  commandType: string;
  summary: string;
  occurredAt: string;
}>;

export type IdempotencyPort = {
  exists(tenantId: string, key: string): Promise<boolean>;
  store(tenantId: string, key: string, resultHash: string): Promise<void>;
};

export type InfrastructurePorts = Readonly<{
  events: EventPublisherPort;
  audit: AuditWriterPort;
  idempotency: IdempotencyPort;
}>;
