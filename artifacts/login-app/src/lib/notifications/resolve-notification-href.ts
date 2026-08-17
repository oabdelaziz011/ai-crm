import { parseNotificationPayload } from "@/lib/notification-i18n";
import type { Notification } from "@/lib/notifications/types";

function readParams(notification: Notification): Record<string, string> {
  const { params } = parseNotificationPayload(notification.messagePayload);
  return params ?? {};
}

function asDashboardHref(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "~/dashboard";
  if (trimmed.startsWith("~/")) return trimmed;
  if (trimmed.startsWith("/dashboard/")) return `~${trimmed}`;
  if (trimmed.startsWith("/")) return `~/dashboard${trimmed}`;
  return `~/dashboard/${trimmed}`;
}

/** Rewrite legacy `/dashboard/invoices/:id` paths to the real workspace query deep-link. */
function normalizeInvoiceHref(href: string, invoiceId?: string): string {
  const match = href.match(/\/dashboard\/invoices\/([0-9a-f-]{36})/i);
  const id = invoiceId || match?.[1];
  if (id) {
    return `~/dashboard/invoices?tab=invoices&invoiceId=${encodeURIComponent(id)}`;
  }
  if (href.includes("/dashboard/invoices")) {
    return "~/dashboard/invoices?tab=invoices";
  }
  return href;
}

/** Prefer related entity deep-links when payload contains known ids; else notification detail. */
export function resolveNotificationHref(notification: Notification): string {
  const p = readParams(notification);

  const invoiceId =
    p.invoiceId ||
    p.invoice_id ||
    (p.entityType === "invoice" ? p.entityId : "") ||
    "";

  if (invoiceId) {
    return `~/dashboard/invoices?tab=invoices&invoiceId=${encodeURIComponent(invoiceId)}`;
  }

  if (p.navigationTarget?.trim()) {
    return normalizeInvoiceHref(asDashboardHref(p.navigationTarget), invoiceId || undefined);
  }

  const bookingId = p.bookingId || p.booking_id || p.appointmentId || p.appointment_id;
  if (bookingId) {
    return `~/dashboard/scheduling?bookingId=${encodeURIComponent(bookingId)}`;
  }

  const customerId =
    p.customerId || p.customer_id || (p.entityType === "customer" ? p.entityId : "");
  if (customerId) {
    return `~/dashboard/customers/${encodeURIComponent(customerId)}`;
  }

  const leadId = p.leadId || p.lead_id || (p.entityType === "lead" ? p.entityId : "");
  if (leadId) {
    return `~/dashboard/leads/${encodeURIComponent(leadId)}`;
  }

  const ticketId = p.ticketId || p.ticket_id || (p.entityType === "ticket" ? p.entityId : "");
  if (ticketId) {
    return `~/dashboard/tickets?ticketId=${encodeURIComponent(ticketId)}`;
  }

  switch (notification.category) {
    case "invoice":
    case "payment":
      return "~/dashboard/invoices?tab=invoices";
    case "booking":
      return "~/dashboard/scheduling";
    case "customer":
      return "~/dashboard/customers";
    case "subscription":
      return "~/dashboard/subscriptions";
    case "whatsapp":
      return "~/dashboard/channels";
    default:
      break;
  }

  return notificationDetailHref(notification.id);
}

export function notificationDetailHref(notificationId: string): string {
  return `~/dashboard/notifications/${notificationId}`;
}
