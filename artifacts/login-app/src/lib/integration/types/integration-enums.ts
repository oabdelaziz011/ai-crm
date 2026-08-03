export type ApiVersion = "v1" | "v2";

export type AuthType = "api_key" | "oauth" | "service_account" | "personal_access_token";

export type ApiScope =
  | "customers.read"
  | "customers.write"
  | "bookings.read"
  | "bookings.write"
  | "branches.read"
  | "invoices.read"
  | "payments.read"
  | "communication.read"
  | "organization.read"
  | "executive.read"
  | "portal.read"
  | "tickets.read"
  | "tickets.write"
  | "handoff.read"
  | "handoff.write"
  | "handoff.manage"
  | "leads.read"
  | "leads.write"
  | "leads.manage";

export type WebhookEventType =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.completed"
  | "customer.created"
  | "customer.updated"
  | "invoice.created"
  | "invoice.paid"
  | "payment.completed"
  | "refund.created"
  | "communication.sent"
  | "portal.login"
  | "organization.transfer"
  | "executive.alert"
  | "ticket.created"
  | "ticket.updated"
  | "ticket.closed"
  | "ticket.reopened"
  | "ticket.assigned"
  | "ticket.comment_added"
  | "ticket.priority_changed"
  | "ticket.deleted"
  | "ticket.status_changed"
  | "conversation.transferred"
  | "conversation.accepted"
  | "conversation.rejected"
  | "conversation.escalated"
  | "conversation.returned_to_ai"
  | "conversation.queue_joined"
  | "conversation.queue_left"
  | "conversation.owner_changed"
  | "lead.created"
  | "lead.updated"
  | "lead.deleted"
  | "lead.assigned"
  | "lead.reassigned"
  | "lead.qualified"
  | "lead.disqualified"
  | "lead.converted"
  | "lead.archived"
  | "lead.restored"
  | "lead.stage_changed"
  | "lead.pipeline_changed";

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "dead_letter";

export type ConnectorType =
  | "accounting"
  | "erp"
  | "laboratory"
  | "radiology"
  | "insurance"
  | "email"
  | "sms"
  | "whatsapp"
  | "calendar"
  | "identity"
  | "storage"
  | "custom";

export type OAuthGrantType = "client_credentials" | "authorization_code" | "refresh_token";

export type EventSourcePlatform =
  | "scheduling"
  | "billing"
  | "communication"
  | "organization"
  | "executive"
  | "portal"
  | "crm"
  | "support";

export type IntegrationHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
