/**
 * Maps platform/license feature keys ↔ billing feature_definitions.code (Phase 2 SoT).
 * Unmapped platform keys are NOT treated as commercial billing modules.
 */

/** Billing catalog codes from migration 263 (+ 302 catalog split + 340 campaigns). */
export const BILLING_FEATURE_CODES = [
  "core_crm",
  "customers",
  "finance",
  "users_roles",
  "company_settings",
  "administration",
  "security_audit",
  "leads",
  "opportunities",
  "bookings",
  "operations",
  "ticketing",
  "campaigns",
  "ai_employee",
  "ai_assistant",
  "ai_email_routing",
  "ai_ticketing",
  "ai_suggested_replies",
  "whatsapp_channel",
  "workflow_automation",
  "facebook_channel",
  "instagram_channel",
  "email_channel",
  "sms_channel",
  "omnichannel",
  "basic_reports",
  "advanced_reports",
  "api_access",
] as const;

export type BillingFeatureCode = (typeof BILLING_FEATURE_CODES)[number];

const PLATFORM_TO_BILLING: Readonly<Record<string, BillingFeatureCode>> = Object.freeze({
  "ai.employee": "ai_employee",
  "ai.chat": "ai_assistant",
  "ai.analytics": "advanced_reports",
  "workflow.automation": "workflow_automation",
  "channel.whatsapp": "whatsapp_channel",
  "channel.instagram": "instagram_channel",
  "channel.facebook": "facebook_channel",
  "channel.messenger": "facebook_channel",
  "channel.email": "email_channel",
  "channel.sms": "sms_channel",
  omnichannel: "omnichannel",
  "reports.enterprise": "advanced_reports",
  "analytics.advanced": "advanced_reports",
  "leads.management": "leads",
  "operations.workspace": "operations",
  "api.access": "api_access",
  // Legacy AI flag keys
  ai_agents: "ai_employee",
  ai_chat: "ai_assistant",
  ai_analytics: "advanced_reports",
  automation: "workflow_automation",
});

/** communication_channels.key → commercial feature_definitions.code (Phase 6). */
const CHANNEL_KEY_TO_FEATURE: Readonly<Record<string, BillingFeatureCode>> = Object.freeze({
  whatsapp: "whatsapp_channel",
  facebook: "facebook_channel",
  messenger: "facebook_channel",
  instagram: "instagram_channel",
  email: "email_channel",
  sms: "sms_channel",
});

/** Resolve a channel catalog key to its commercial entitlement code, if gated. */
export function resolveChannelCommercialFeatureCode(
  channelKey: string | null | undefined,
): BillingFeatureCode | null {
  if (!channelKey?.trim()) return null;
  return CHANNEL_KEY_TO_FEATURE[channelKey.trim().toLowerCase()] ?? null;
}

const BILLING_TO_PLATFORM: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(PLATFORM_TO_BILLING).map(([platform, billing]) => [billing, platform])),
);

export function isBillingFeatureCode(code: string): code is BillingFeatureCode {
  return (BILLING_FEATURE_CODES as readonly string[]).includes(code);
}

/** Resolve a platform / legacy / billing key to a billing feature_definitions.code when commercial. */
export function toBillingFeatureCode(featureKey: string): BillingFeatureCode | null {
  const trimmed = featureKey.trim();
  if (!trimmed) return null;
  if (isBillingFeatureCode(trimmed)) return trimmed;
  return PLATFORM_TO_BILLING[trimmed] ?? null;
}

export function toPlatformFeatureKey(billingCode: string): string | null {
  return BILLING_TO_PLATFORM[billingCode] ?? null;
}

/** True when this key is gated by Phase 2 commercial entitlements (not license fail-open). */
export function isCommercialBillingMappedKey(featureKey: string): boolean {
  return toBillingFeatureCode(featureKey) != null;
}
