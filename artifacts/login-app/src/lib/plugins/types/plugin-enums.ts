export type PluginCategory =
  | "crm"
  | "scheduling"
  | "billing"
  | "communication"
  | "executive"
  | "organization"
  | "portal"
  | "automation"
  | "analytics"
  | "general";

export type PluginInstallationStatus =
  | "installed"
  | "enabled"
  | "disabled"
  | "upgrading"
  | "error"
  | "uninstalled";

export type PluginHealthStatus = "healthy" | "degraded" | "unhealthy" | "crashed" | "unknown";

export type PluginPermission =
  | "customers.read"
  | "customers.write"
  | "bookings.read"
  | "bookings.write"
  | "billing.read"
  | "billing.write"
  | "communication.send"
  | "reports.read"
  | "organization.read"
  | "executive.read"
  | "portal.read";

export type ExtensionPoint =
  | "crm.customer.profile"
  | "scheduling.booking.form"
  | "billing.invoice.detail"
  | "communication.template"
  | "executive.dashboard"
  | "organization.branch"
  | "portal.booking"
  | "dashboard.widget"
  | "navigation.sidebar"
  | "settings.page"
  | "workflow.event"
  | "automation.trigger";

export type PluginHookType = "event" | "widget" | "command" | "validation" | "navigation" | "settings";

export type PlatformVersion = "7.0.0" | "7.1.0" | "7.2.0" | "7.3.0" | "7.4.0";

export const CURRENT_PLATFORM_VERSION: PlatformVersion = "7.4.0";

export type PluginEventType =
  | "booking.created"
  | "booking.updated"
  | "booking.cancelled"
  | "booking.completed"
  | "customer.created"
  | "customer.updated"
  | "invoice.created"
  | "invoice.paid"
  | "payment.completed"
  | "communication.sent"
  | "organization.transfer"
  | "executive.alert";
