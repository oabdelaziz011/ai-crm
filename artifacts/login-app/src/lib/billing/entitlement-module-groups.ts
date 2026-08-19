import type { CompanyEntitlement } from "@/lib/billing/types";

export type EntitlementModuleId =
  | "crm"
  | "finance"
  | "ai"
  | "channels"
  | "service"
  | "automation"
  | "reporting"
  | "integrations"
  | "administration"
  | "other";

const MODULE_CODES: Record<EntitlementModuleId, readonly string[]> = {
  crm: ["customers", "leads", "opportunities", "bookings", "operations"],
  finance: ["finance"],
  ai: ["ai_employee", "ai_assistant", "ai_email_routing", "ai_ticketing", "ai_suggested_replies"],
  channels: [
    "omnichannel",
    "whatsapp_channel",
    "facebook_channel",
    "instagram_channel",
    "email_channel",
    "sms_channel",
  ],
  service: ["ticketing"],
  automation: ["workflow_automation"],
  reporting: ["basic_reports", "advanced_reports"],
  integrations: ["api_access"],
  administration: ["administration", "users_roles", "company_settings", "security_audit"],
  other: [],
};

const MODULE_ORDER: EntitlementModuleId[] = [
  "crm",
  "finance",
  "ai",
  "channels",
  "service",
  "automation",
  "reporting",
  "integrations",
  "administration",
  "other",
];

export function resolveEntitlementModule(featureCode: string): EntitlementModuleId {
  for (const id of MODULE_ORDER) {
    if (id === "other") continue;
    if (MODULE_CODES[id].includes(featureCode)) return id;
  }
  return "other";
}

export function groupEntitlementsByModule(
  rows: readonly CompanyEntitlement[],
): Array<{ module: EntitlementModuleId; rows: CompanyEntitlement[] }> {
  const buckets = new Map<EntitlementModuleId, CompanyEntitlement[]>();
  for (const row of rows) {
    const module = resolveEntitlementModule(row.feature_code);
    const list = buckets.get(module) ?? [];
    list.push(row);
    buckets.set(module, list);
  }
  return MODULE_ORDER.filter((module) => (buckets.get(module)?.length ?? 0) > 0).map((module) => ({
    module,
    rows: buckets.get(module) ?? [],
  }));
}
