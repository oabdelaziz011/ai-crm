import type { PlatformEvent } from "@workspace/platform-events";
import type { NotificationCreateInput } from "../ports/repository-ports.js";

type MappedNotification = NotificationCreateInput | null;

function str(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function moneyLabel(amountCents: unknown, currency: unknown): string {
  const cents = Number(amountCents);
  const code = str(currency, "USD").toUpperCase();
  if (!Number.isFinite(cents) || cents <= 0) return "";
  return `${(cents / 100).toFixed(2)} ${code}`;
}

function payloadMeta(
  payload: Record<string, unknown>,
  extras: Record<string, string> = {},
): Record<string, string> {
  const amount = moneyLabel(payload.amountCents, payload.currency);
  return {
    customerId: str(payload.customerId),
    customerName: str(payload.displayName ?? payload.customerName ?? payload.name),
    bookingId: str(payload.bookingId),
    invoiceId: str(payload.invoiceId),
    invoiceNumber: str(payload.invoiceNumber),
    paymentId: str(payload.paymentId),
    amountCents: Number.isFinite(Number(payload.amountCents)) ? String(payload.amountCents) : "",
    currency: str(payload.currency).toUpperCase(),
    amount,
    reason: str(payload.reason),
    method: str(payload.method),
    ...extras,
  };
}

function baseInput(
  envelope: PlatformEvent,
  partial: Omit<NotificationCreateInput, "tenantId" | "correlationId" | "eventType" | "severity"> & {
    eventType: string;
    severity?: string;
    recipientUserId?: string | null;
  },
): NotificationCreateInput {
  const payload = envelope.payload as Record<string, unknown>;
  return Object.freeze({
    tenantId: envelope.tenantId,
    correlationId: envelope.correlationId,
    severity: partial.severity ?? "information",
    recipientUserId: partial.recipientUserId ?? null,
    recipientRole: partial.recipientRole,
    eventType: partial.eventType,
    title: partial.title,
    body: partial.body,
    category: partial.category,
    priority: partial.priority,
    entityType: partial.entityType ?? envelope.entityType,
    entityId: partial.entityId ?? envelope.entityId ?? (typeof payload.customerId === "string" ? payload.customerId : undefined),
    navigationTarget: partial.navigationTarget,
    metadata: partial.metadata,
    idempotencyKey: `${envelope.correlationId}:${envelope.eventType}`,
  });
}

/** Maps platform bus events → notification create inputs (channel-agnostic). */
export function mapPlatformEventToNotificationInput(envelope: PlatformEvent): MappedNotification {
  const payload = envelope.payload as Record<string, unknown>;
  const customerId = str(payload.customerId);
  const bookingId = str(payload.bookingId);
  const invoiceId = str(payload.invoiceId);
  const amount = moneyLabel(payload.amountCents, payload.currency);

  switch (envelope.eventType) {
    case "CustomerCreated": {
      const name = str(payload.displayName, "customer");
      return baseInput(envelope, {
        eventType: "customer_created",
        title: "New customer",
        body: `Customer ${name} was added.`,
        category: "customer",
        priority: "low",
        severity: "success",
        entityType: "customer",
        entityId: customerId,
        navigationTarget: `/dashboard/customers/${customerId}`,
        recipientRole: "reception",
        metadata: payloadMeta(payload, { name, customerName: name }),
      });
    }
    case "LeadConverted":
      return baseInput(envelope, {
        eventType: "customer_created",
        title: "Lead converted",
        body: customerId
          ? `A lead was converted to customer ${customerId.slice(0, 8)}.`
          : "A lead was converted to a customer.",
        category: "customer",
        priority: "normal",
        severity: "success",
        entityType: "customer",
        entityId: customerId,
        navigationTarget: `/dashboard/customers/${customerId}`,
        recipientRole: "sales",
        metadata: payloadMeta(payload),
      });
    case "BookingCreated":
      return baseInput(envelope, {
        eventType: "appointment_created",
        title: "Booking created",
        body: bookingId
          ? `A new booking (${bookingId.slice(0, 8)}) was scheduled.`
          : "A new booking was scheduled.",
        category: "booking",
        priority: "normal",
        severity: "information",
        entityType: "booking",
        entityId: bookingId,
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
        metadata: payloadMeta(payload),
      });
    case "BookingConfirmed":
      return baseInput(envelope, {
        eventType: "appointment_created",
        title: "Booking confirmed",
        body: bookingId
          ? `Booking ${bookingId.slice(0, 8)} was confirmed.`
          : "A booking was confirmed.",
        category: "booking",
        priority: "normal",
        severity: "success",
        entityType: "booking",
        entityId: bookingId,
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
        metadata: payloadMeta(payload),
      });
    case "BookingCancelled": {
      const reason = str(payload.reason, "No reason provided");
      return baseInput(envelope, {
        eventType: "appointment_cancelled",
        title: "Booking cancelled",
        body: bookingId
          ? `Booking ${bookingId.slice(0, 8)} was cancelled. Reason: ${reason}`
          : reason,
        category: "booking",
        priority: "high",
        severity: "warning",
        entityType: "booking",
        entityId: bookingId,
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
        metadata: payloadMeta(payload, { reason }),
      });
    }
    case "BookingCompleted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Operation completed",
        body: bookingId
          ? `Booking ${bookingId.slice(0, 8)} was completed.`
          : "A booking operation was completed.",
        category: "booking",
        priority: "normal",
        severity: "success",
        entityType: "booking",
        entityId: bookingId,
        navigationTarget: "/dashboard/bookings",
        metadata: payloadMeta(payload),
      });
    case "InvoiceGenerated":
      return baseInput(envelope, {
        eventType: "invoice_created",
        title: "Invoice generated",
        body: amount
          ? `Invoice ${invoiceId.slice(0, 8) || "new"} for ${amount} was created.`
          : `Invoice ${invoiceId.slice(0, 8) || "new"} was created.`,
        category: "invoice",
        priority: "normal",
        severity: "information",
        entityType: "invoice",
        entityId: invoiceId,
        navigationTarget: invoiceId
          ? `/dashboard/invoices?tab=invoices&invoiceId=${invoiceId}`
          : "/dashboard/invoices",
        recipientRole: "finance",
        metadata: payloadMeta(payload),
      });
    case "InvoicePaid":
      return baseInput(envelope, {
        eventType: "payment_received",
        title: "Invoice paid",
        body: amount
          ? `Invoice ${invoiceId.slice(0, 8) || ""} was fully paid (${amount}).`
          : `Invoice ${invoiceId.slice(0, 8) || ""} was fully paid.`,
        category: "payment",
        priority: "normal",
        severity: "success",
        entityType: "invoice",
        entityId: invoiceId,
        navigationTarget: `/dashboard/invoices?tab=invoices&invoiceId=${invoiceId}`,
        recipientRole: "finance",
        metadata: payloadMeta(payload),
      });
    case "PaymentCollected": {
      const paymentId = str(payload.paymentId);
      return baseInput(envelope, {
        eventType: "payment_received",
        title: "Payment collected",
        body: amount
          ? `Payment of ${amount} received${invoiceId ? ` for invoice ${invoiceId.slice(0, 8)}` : ""}.`
          : "A payment was received.",
        category: "payment",
        priority: "normal",
        severity: "success",
        entityType: "invoice",
        entityId: invoiceId || paymentId,
        navigationTarget: invoiceId
          ? `/dashboard/invoices?tab=invoices&invoiceId=${invoiceId}`
          : "/dashboard/invoices?tab=payments",
        recipientRole: "finance",
        metadata: payloadMeta(payload),
      });
    }
    case "TaskAssigned":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Task assigned",
        body: str(payload.title, "A task was assigned to you."),
        category: "system",
        priority: "normal",
        severity: "action_required",
        entityType: "task",
        entityId: str(payload.taskId),
        recipientUserId: str(payload.assigneeId),
        navigationTarget: "/dashboard/tasks",
        metadata: payloadMeta(payload, { detail: str(payload.title) }),
      });
    case "TaskCompleted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Task completed",
        body: str(payload.taskId)
          ? `Task ${str(payload.taskId).slice(0, 8)} was marked complete.`
          : "A task was marked complete.",
        category: "system",
        priority: "low",
        severity: "success",
        entityType: "task",
        entityId: str(payload.taskId),
        metadata: payloadMeta(payload),
      });
    case "WorkflowExecuted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Workflow executed",
        body: `Workflow ${str(payload.workflowName ?? payload.workflowId, "completed")} ran.`,
        category: "system",
        priority: "low",
        severity: "workflow",
        entityType: "workflow",
        entityId: str(payload.workflowId),
        metadata: payloadMeta(payload, {
          detail: `Workflow ${str(payload.workflowName ?? payload.workflowId, "completed")} ran.`,
        }),
      });
    case "AISummaryGenerated":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "AI summary ready",
        body: "An AI summary was generated.",
        category: "system",
        priority: "low",
        severity: "ai_suggestion",
        entityType: str(payload.entityType, "entity"),
        entityId: str(payload.entityId),
        metadata: payloadMeta(payload),
      });
    case "KnowledgeUpdated":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Knowledge updated",
        body: str(payload.title, "A knowledge document was updated."),
        category: "system",
        priority: "low",
        severity: "information",
        entityType: "knowledge",
        entityId: str(payload.documentId),
        navigationTarget: "/dashboard/knowledge",
        metadata: payloadMeta(payload, { detail: str(payload.title) }),
      });
    case "PermissionChanged":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Permission changed",
        body: `Permission ${str(payload.permission)} was ${str(payload.action, "updated")}.`,
        category: "system",
        priority: "high",
        severity: "security",
        entityType: "user",
        entityId: str(payload.userId),
        recipientRole: "admin",
        metadata: payloadMeta(payload, {
          detail: `Permission ${str(payload.permission)} was ${str(payload.action, "updated")}.`,
        }),
      });
    case "FileUploaded":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "File uploaded",
        body: str(payload.fileName, "A file was uploaded."),
        category: "system",
        priority: "low",
        severity: "information",
        entityType: str(payload.entityType, "file"),
        entityId: str(payload.fileId),
        metadata: payloadMeta(payload, { detail: str(payload.fileName) }),
      });
    default:
      return null;
  }
}

export const PLATFORM_NOTIFICATION_EVENT_TYPES = [
  "CustomerCreated",
  "LeadConverted",
  "BookingCreated",
  "BookingConfirmed",
  "BookingCancelled",
  "BookingCompleted",
  "InvoiceGenerated",
  "InvoicePaid",
  "PaymentCollected",
  "TaskAssigned",
  "TaskCompleted",
  "WorkflowExecuted",
  "AISummaryGenerated",
  "KnowledgeUpdated",
  "PermissionChanged",
  "FileUploaded",
] as const;
