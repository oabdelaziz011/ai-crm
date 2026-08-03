import type { PlatformEvent } from "@workspace/platform-events";
import type { NotificationCreateInput } from "../ports/repository-ports.js";

type MappedNotification = NotificationCreateInput | null;

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

  switch (envelope.eventType) {
    case "CustomerCreated":
      return baseInput(envelope, {
        eventType: "customer_created",
        title: "New customer",
        body: `Customer ${String(payload.displayName ?? "created")} was added.`,
        category: "customer",
        priority: "low",
        severity: "success",
        entityType: "customer",
        entityId: String(payload.customerId ?? ""),
        navigationTarget: `/dashboard/customers/${String(payload.customerId ?? "")}`,
        recipientRole: "reception",
      });
    case "LeadConverted":
      return baseInput(envelope, {
        eventType: "customer_created",
        title: "Lead converted",
        body: "A lead was converted to a customer.",
        category: "customer",
        priority: "normal",
        severity: "success",
        entityType: "customer",
        entityId: String(payload.customerId ?? ""),
        navigationTarget: `/dashboard/customers/${String(payload.customerId ?? "")}`,
        recipientRole: "sales",
      });
    case "BookingCreated":
      return baseInput(envelope, {
        eventType: "appointment_created",
        title: "Booking created",
        body: "A new booking was scheduled.",
        category: "booking",
        priority: "normal",
        severity: "information",
        entityType: "booking",
        entityId: String(payload.bookingId ?? ""),
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
      });
    case "BookingConfirmed":
      return baseInput(envelope, {
        eventType: "appointment_created",
        title: "Booking confirmed",
        body: "A booking was confirmed.",
        category: "booking",
        priority: "normal",
        severity: "success",
        entityType: "booking",
        entityId: String(payload.bookingId ?? ""),
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
      });
    case "BookingCancelled":
      return baseInput(envelope, {
        eventType: "appointment_cancelled",
        title: "Booking cancelled",
        body: String(payload.reason ?? "A booking was cancelled."),
        category: "booking",
        priority: "high",
        severity: "warning",
        entityType: "booking",
        entityId: String(payload.bookingId ?? ""),
        navigationTarget: "/dashboard/bookings",
        recipientRole: "reception",
      });
    case "BookingCompleted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Operation completed",
        body: "A booking operation was completed.",
        category: "booking",
        priority: "normal",
        severity: "success",
        entityType: "booking",
        entityId: String(payload.bookingId ?? ""),
        navigationTarget: "/dashboard/bookings",
      });
    case "InvoiceGenerated":
      return baseInput(envelope, {
        eventType: "invoice_created",
        title: "Invoice generated",
        body: `Invoice for ${((Number(payload.amountCents ?? 0)) / 100).toFixed(2)} ${String(payload.currency ?? "USD")}.`,
        category: "invoice",
        priority: "normal",
        severity: "information",
        entityType: "invoice",
        entityId: String(payload.invoiceId ?? ""),
        navigationTarget: "/dashboard/invoices",
        recipientRole: "finance",
      });
    case "InvoicePaid":
      return baseInput(envelope, {
        eventType: "payment_received",
        title: "Invoice paid",
        body: "An invoice was fully paid.",
        category: "payment",
        priority: "normal",
        severity: "success",
        entityType: "invoice",
        entityId: String(payload.invoiceId ?? ""),
        navigationTarget: "/dashboard/invoices",
        recipientRole: "finance",
      });
    case "PaymentCollected":
      return baseInput(envelope, {
        eventType: "payment_received",
        title: "Payment collected",
        body: `Payment of ${((Number(payload.amountCents ?? 0)) / 100).toFixed(2)} ${String(payload.currency ?? "USD")} received.`,
        category: "payment",
        priority: "normal",
        severity: "success",
        entityType: "payment",
        entityId: String(payload.paymentId ?? ""),
        navigationTarget: "/dashboard/invoices",
        recipientRole: "finance",
      });
    case "TaskAssigned":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Task assigned",
        body: String(payload.title ?? "A task was assigned to you."),
        category: "system",
        priority: "normal",
        severity: "action_required",
        entityType: "task",
        entityId: String(payload.taskId ?? ""),
        recipientUserId: String(payload.assigneeId ?? ""),
        navigationTarget: "/dashboard/tasks",
      });
    case "TaskCompleted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Task completed",
        body: "A task was marked complete.",
        category: "system",
        priority: "low",
        severity: "success",
        entityType: "task",
        entityId: String(payload.taskId ?? ""),
      });
    case "WorkflowExecuted":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Workflow executed",
        body: `Workflow ${String(payload.workflowName ?? payload.workflowId ?? "completed")} ran.`,
        category: "system",
        priority: "low",
        severity: "workflow",
        entityType: "workflow",
        entityId: String(payload.workflowId ?? ""),
      });
    case "AISummaryGenerated":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "AI summary ready",
        body: "An AI summary was generated.",
        category: "system",
        priority: "low",
        severity: "ai_suggestion",
        entityType: String(payload.entityType ?? "entity"),
        entityId: String(payload.entityId ?? ""),
      });
    case "KnowledgeUpdated":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Knowledge updated",
        body: String(payload.title ?? "A knowledge document was updated."),
        category: "system",
        priority: "low",
        severity: "information",
        entityType: "knowledge",
        entityId: String(payload.documentId ?? ""),
        navigationTarget: "/dashboard/knowledge",
      });
    case "PermissionChanged":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "Permission changed",
        body: `Permission ${String(payload.permission ?? "")} was ${String(payload.action ?? "updated")}.`,
        category: "system",
        priority: "high",
        severity: "security",
        entityType: "user",
        entityId: String(payload.userId ?? ""),
        recipientRole: "admin",
      });
    case "FileUploaded":
      return baseInput(envelope, {
        eventType: "generic_system",
        title: "File uploaded",
        body: String(payload.fileName ?? "A file was uploaded."),
        category: "system",
        priority: "low",
        severity: "information",
        entityType: String(payload.entityType ?? "file"),
        entityId: String(payload.fileId ?? ""),
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
