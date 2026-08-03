import type { EventSourcePlatform, WebhookEventType } from "@/lib/integration/types";

export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  "booking.created",
  "booking.updated",
  "booking.cancelled",
  "booking.completed",
  "customer.created",
  "customer.updated",
  "invoice.created",
  "invoice.paid",
  "payment.completed",
  "refund.created",
  "communication.sent",
  "portal.login",
  "organization.transfer",
  "executive.alert",
  "ticket.created",
  "ticket.updated",
  "ticket.closed",
  "ticket.reopened",
  "ticket.assigned",
  "ticket.comment_added",
  "ticket.priority_changed",
  "ticket.deleted",
  "ticket.status_changed",
];

export const EVENT_SOURCE_MAP: Record<WebhookEventType, EventSourcePlatform> = {
  "booking.created": "scheduling",
  "booking.updated": "scheduling",
  "booking.cancelled": "scheduling",
  "booking.completed": "scheduling",
  "customer.created": "crm",
  "customer.updated": "crm",
  "invoice.created": "billing",
  "invoice.paid": "billing",
  "payment.completed": "billing",
  "refund.created": "billing",
  "communication.sent": "communication",
  "portal.login": "portal",
  "organization.transfer": "organization",
  "executive.alert": "executive",
  "ticket.created": "support",
  "ticket.updated": "support",
  "ticket.closed": "support",
  "ticket.reopened": "support",
  "ticket.assigned": "support",
  "ticket.comment_added": "support",
  "ticket.priority_changed": "support",
  "ticket.deleted": "support",
  "ticket.status_changed": "support",
};

export function isRegisteredEventType(type: string): type is WebhookEventType {
  return WEBHOOK_EVENT_TYPES.includes(type as WebhookEventType);
}
