import {
  createModulePublisher,
  type PlatformEventBus,
} from "@workspace/platform-events";
import type { EventPublisherPort, PublishEventContext, AuditWriterPort, IdempotencyPort } from "../ports/infrastructure-ports.js";

export function createEventPublisherPort(bus: PlatformEventBus): EventPublisherPort {
  const publisher = createModulePublisher(bus, "application-layer");

  const ctx = (c: PublishEventContext) => ({
    tenantId: c.tenantId,
    workspaceId: c.workspaceId,
    actorId: c.actorId,
    actorType: c.actorType ?? ("user" as const),
    correlationId: c.correlationId,
    sourceModule: "application-layer",
  });

  return {
    async publishCustomerCreated(input) {
      const result = await publisher.publish("CustomerCreated", {
        customerId: input.customerId,
        displayName: input.displayName,
        email: input.email,
        phone: input.phone,
      }, { ...ctx(input.context), sourceModule: "crm", entityType: "customer", entityId: input.customerId });
      return result.eventId;
    },
    async publishLeadConverted(input) {
      const result = await publisher.publish("LeadConverted", {
        leadId: input.leadId,
        customerId: input.customerId,
      }, { ...ctx(input.context), sourceModule: "leads", entityType: "lead", entityId: input.leadId });
      return result.eventId;
    },
    async publishLeadCreated(input) {
      const result = await publisher.publish("LeadCreated", {
        leadId: input.leadId,
        title: input.title,
        source: input.source,
      }, { ...ctx(input.context), sourceModule: "leads", entityType: "lead", entityId: input.leadId });
      return result.eventId;
    },
    async publishLeadUpdated(input) {
      const result = await publisher.publish("LeadUpdated", {
        leadId: input.leadId,
        changedFields: [...input.changedFields],
        patch: input.patch,
      }, { ...ctx(input.context), sourceModule: "leads", entityType: "lead", entityId: input.leadId });
      return result.eventId;
    },
    async publishBookingCreated(input) {
      const result = await publisher.publish("BookingCreated", {
        bookingId: input.bookingId,
        customerId: input.customerId,
        scheduledAt: input.scheduledAt,
        serviceId: input.serviceId,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishBookingCancelled(input) {
      const result = await publisher.publish("BookingCancelled", {
        bookingId: input.bookingId,
        customerId: input.customerId,
        reason: input.reason,
        cancelledAt: input.cancelledAt,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishBookingCompleted(input) {
      const mod = createModulePublisher(bus, "booking");
      const result = await mod.publish("BookingCompleted", {
        bookingId: input.bookingId,
        customerId: input.customerId,
        completedAt: input.completedAt,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishPaymentCollected(input) {
      const result = await publisher.publish("PaymentCollected", {
        paymentId: input.paymentId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        currency: input.currency,
        method: input.method,
        invoiceId: input.invoiceId,
      }, { ...ctx(input.context), sourceModule: "payment", entityType: "payment", entityId: input.paymentId });
      return result.eventId;
    },
    async publishInvoiceGenerated(input) {
      const result = await publisher.publish("InvoiceGenerated", {
        invoiceId: input.invoiceId,
        customerId: input.customerId,
        amountCents: input.amountCents,
        currency: input.currency,
        dueAt: input.dueAt,
      }, { ...ctx(input.context), sourceModule: "invoice", entityType: "invoice", entityId: input.invoiceId });
      return result.eventId;
    },
    async publishTaskCompleted(input) {
      const result = await publisher.publish("TaskCompleted", {
        taskId: input.taskId,
        completedBy: input.completedBy,
        completedAt: input.completedAt,
      }, { ...ctx(input.context), sourceModule: "tasks", entityType: "task", entityId: input.taskId });
      return result.eventId;
    },
    async publishTaskAssigned(input) {
      const result = await publisher.publish("TaskAssigned", {
        taskId: input.taskId,
        assigneeId: input.assigneeId,
        title: input.title,
        entityType: input.entityType,
        entityId: input.entityId,
      }, { ...ctx(input.context), sourceModule: "tasks", entityType: "task", entityId: input.taskId });
      return result.eventId;
    },
    async publishTaskCreated(input) {
      const result = await publisher.publish("TaskCreated", {
        taskId: input.taskId,
        title: input.title,
        assigneeId: input.assigneeId,
        entityType: input.entityType,
        entityId: input.entityId,
      }, { ...ctx(input.context), sourceModule: "tasks", entityType: "task", entityId: input.taskId });
      return result.eventId;
    },
    async publishInvoicePaid(input) {
      const result = await publisher.publish("InvoicePaid", {
        invoiceId: input.invoiceId,
        customerId: input.customerId,
        paidAt: input.paidAt,
        amountCents: input.amountCents,
      }, { ...ctx(input.context), sourceModule: "invoice", entityType: "invoice", entityId: input.invoiceId });
      return result.eventId;
    },
    async publishBookingNoShow(input) {
      const result = await publisher.publish("BookingNoShow", {
        bookingId: input.bookingId,
        customerId: input.customerId,
        markedAt: input.markedAt,
        gracePeriodMinutes: input.gracePeriodMinutes,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishBookingRescheduled(input) {
      const result = await publisher.publish("BookingRescheduled", {
        bookingId: input.bookingId,
        customerId: input.customerId,
        scheduledAt: input.scheduledAt,
        rescheduledAt: input.rescheduledAt,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishConfigurationUpdated(input) {
      const result = await publisher.publish("ConfigurationUpdated", {
        configurationId: input.configurationId,
        domain: input.domain,
        scopeKey: input.scopeKey,
        version: input.version,
        status: input.status,
      }, { ...ctx(input.context), sourceModule: "configuration", entityType: "configuration", entityId: input.configurationId });
      return result.eventId;
    },
    async publishConfigurationPublished(input) {
      const result = await publisher.publish("ConfigurationPublished", {
        configurationId: input.configurationId,
        domain: input.domain,
        scopeKey: input.scopeKey,
        version: input.version,
      }, { ...ctx(input.context), sourceModule: "configuration", entityType: "configuration", entityId: input.configurationId });
      return result.eventId;
    },
    async publishFileUploaded(input) {
      const result = await publisher.publish("FileUploaded", {
        fileId: input.fileId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        entityType: input.entityType,
        entityId: input.entityId,
      }, { ...ctx(input.context), sourceModule: "files", entityType: input.entityType, entityId: input.entityId });
      return result.eventId;
    },
    async publishWorkflowExecuted(input) {
      const result = await publisher.publish("WorkflowExecuted", {
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        triggerEventType: input.triggerEventType,
        status: input.status,
      }, { ...ctx(input.context), sourceModule: "workflow", entityType: "workflow", entityId: input.workflowId });
      return result.eventId;
    },
    async publishAISummaryGenerated(input) {
      const result = await publisher.publish("AISummaryGenerated", {
        summaryId: input.summaryId,
        entityType: input.entityType,
        entityId: input.entityId,
        model: input.model,
      }, { ...ctx(input.context), sourceModule: "ai", entityType: input.entityType, entityId: input.entityId });
      return result.eventId;
    },
    async publishCustomerUpdated(input) {
      const result = await publisher.publish("CustomerUpdated", {
        customerId: input.customerId,
        changedFields: [...input.changedFields],
        patch: input.patch,
      }, { ...ctx(input.context), sourceModule: "crm", entityType: "customer", entityId: input.customerId });
      return result.eventId;
    },
    async publishKnowledgeUpdated(input) {
      const result = await publisher.publish("KnowledgeUpdated", {
        documentId: input.documentId,
        title: input.title,
        action:
          input.action === "published"
            ? "updated"
            : input.action === "archived"
              ? "deleted"
              : input.action,
      }, { ...ctx(input.context), sourceModule: "knowledge", entityType: "knowledge_document", entityId: input.documentId });
      return result.eventId;
    },
    async publishFeatureFlagUpdated(input) {
      const result = await publisher.publish("FeatureFlagUpdated", {
        featureKey: input.featureKey,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        enabled: input.enabled,
      }, { ...ctx(input.context), sourceModule: "configuration", entityType: "feature_flag", entityId: input.featureKey });
      return result.eventId;
    },
    async publishLicenseChanged(input) {
      const result = await publisher.publish("LicenseChanged", {
        planCode: input.planCode,
        status: input.status,
        previousPlanCode: input.previousPlanCode,
      }, { ...ctx(input.context), sourceModule: "licensing", entityType: "license", entityId: input.planCode });
      return result.eventId;
    },
    async publishConversationTransferred(input) {
      const result = await publisher.publish("ConversationTransferred", {
        conversationId: input.conversationId,
        fromOwnerType: input.fromOwnerType,
        toOwnerType: input.toOwnerType,
        reason: input.reason,
      }, { ...ctx(input.context), sourceModule: "handoff", entityType: "conversation", entityId: input.conversationId });
      return result.eventId;
    },
    async publishEmployeeAssigned(input) {
      const result = await publisher.publish("EmployeeAssigned", {
        employeeId: input.employeeId,
        bookingId: input.bookingId,
        customerId: input.customerId,
      }, { ...ctx(input.context), sourceModule: "booking", entityType: "booking", entityId: input.bookingId });
      return result.eventId;
    },
    async publishWorkflowStarted(input) {
      const result = await publisher.publish("WorkflowStarted", {
        workflowId: input.workflowId,
        workflowName: input.workflowName,
        triggerEventType: input.triggerEventType ?? "",
      }, { ...ctx(input.context), sourceModule: "workflow", entityType: "workflow", entityId: input.workflowId });
      return result.eventId;
    },
    async publishOpportunityCreated(input) {
      const result = await publisher.publish(
        "OpportunityCreated",
        {
          opportunityId: input.opportunityId,
          name: input.name,
          leadId: input.leadId,
          companyId: input.companyId,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
    async publishOpportunityStageChanged(input) {
      const result = await publisher.publish(
        "OpportunityStageChanged",
        {
          opportunityId: input.opportunityId,
          fromStageId: input.fromStageId,
          toStageId: input.toStageId,
          stageKey: input.stageKey,
          companyId: input.companyId,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
    async publishOpportunityProbabilityChanged(input) {
      const result = await publisher.publish(
        "OpportunityProbabilityChanged",
        {
          opportunityId: input.opportunityId,
          previousPercent: input.previousPercent,
          nextPercent: input.nextPercent,
          source: input.source,
          companyId: input.companyId,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
    async publishOpportunityNegotiationStarted(input) {
      const result = await publisher.publish(
        "OpportunityNegotiationStarted",
        {
          opportunityId: input.opportunityId,
          companyId: input.companyId,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
    async publishOpportunityWon(input) {
      const result = await publisher.publish(
        "OpportunityWon",
        {
          opportunityId: input.opportunityId,
          companyId: input.companyId,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
    async publishOpportunityLost(input) {
      const result = await publisher.publish(
        "OpportunityLost",
        {
          opportunityId: input.opportunityId,
          companyId: input.companyId,
          reason: input.reason,
        },
        {
          ...ctx(input.context),
          sourceModule: "opportunities",
          entityType: "opportunity",
          entityId: input.opportunityId,
        },
      );
      return result.eventId;
    },
  };
}

export function createMockAuditWriterPort(): AuditWriterPort & {
  entries: Array<{ commandType: string; correlationId: string }>;
} {
  const entries: Array<{ commandType: string; correlationId: string }> = [];
  return {
    entries,
    async write(entry) {
      entries.push({ commandType: entry.commandType, correlationId: entry.correlationId });
    },
  };
}

export function createMockIdempotencyPort(): IdempotencyPort {
  const store = new Map<string, string>();
  return {
    async exists(tenantId, key) {
      return store.has(`${tenantId}:${key}`);
    },
    async store(tenantId, key, hash) {
      store.set(`${tenantId}:${key}`, hash);
    },
  };
}
