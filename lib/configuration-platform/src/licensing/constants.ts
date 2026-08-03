export const LICENSE_PLAN_CODES = [
  "starter",
  "professional",
  "business",
  "enterprise",
  "custom",
  "basic",
  "pro",
] as const;

export type LicensePlanCode = (typeof LICENSE_PLAN_CODES)[number];

export const LICENSE_STATUSES = ["active", "trial", "grace", "expired", "suspended"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

/** Entitlement keys checked via license.canAccess() — never compare plan names in code. */
export const LICENSE_ENTITLEMENT_KEYS = [
  "ai.employee",
  "ai.chat",
  "ai.analytics",
  "knowledge.platform",
  "workflow.automation",
  "customer.portal",
  "employee.portal",
  "public.booking",
  "dashboard.executive",
  "analytics.advanced",
  "reports.enterprise",
  "leads.management",
  "tasks.management",
  "operations.workspace",
  "call.center",
  "omnichannel",
  "channel.whatsapp",
  "channel.instagram",
  "channel.facebook",
  "channel.voice",
  "api.access",
] as const;

export type LicenseEntitlementKey = (typeof LICENSE_ENTITLEMENT_KEYS)[number];

export const LICENSE_QUOTA_KEYS = [
  "users",
  "branches",
  "storage_gb",
  "ai_tokens_monthly",
  "automation_runs_monthly",
  "knowledge_documents",
  "bookings_monthly",
  "customers",
  "tasks",
  "workflows",
  "api_calls_monthly",
] as const;

export type LicenseQuotaKey = (typeof LICENSE_QUOTA_KEYS)[number];
