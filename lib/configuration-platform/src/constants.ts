/** Registered configuration domains — single source of truth for domain codes. */
export const CONFIGURATION_DOMAINS = [
  "workspace",
  "crm",
  "customers",
  "operations",
  "operations.workspace",
  "bookings",
  "scheduling",
  "calendar",
  "billing",
  "payments",
  "subscriptions",
  "notifications",
  "automation",
  "ai",
  "knowledge",
  "dashboard",
  "analytics",
  "customer_portal",
  "employee_portal",
  "public_booking",
  "global_search",
  "reports",
  "omnichannel",
  "call_center",
] as const;

export type ConfigurationDomain = (typeof CONFIGURATION_DOMAINS)[number];

export const METADATA_FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "currency",
  "date",
  "datetime",
  "json",
  "lookup",
  "formula",
  "array",
  "object",
] as const;

export type MetadataFieldType = (typeof METADATA_FIELD_TYPES)[number];

export const CONFIGURATION_STATUSES = ["draft", "published"] as const;
export type ConfigurationStatus = (typeof CONFIGURATION_STATUSES)[number];

export const CONFIGURATION_VERSION_ACTIONS = [
  "draft",
  "publish",
  "rollback",
  "restore",
] as const;

export type ConfigurationVersionAction = (typeof CONFIGURATION_VERSION_ACTIONS)[number];

export const CONFIGURATION_PERMISSION_PREFIX = "configuration";

export function configurationDomainPermission(domain: string, action: "read" | "write"): string {
  const normalized = domain.replace(/\./g, ".");
  return `${CONFIGURATION_PERMISSION_PREFIX}.${normalized}.${action}`;
}
