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
  | "portal.read";

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
  | "executive.alert";

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
  | "crm";

export type IntegrationHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
