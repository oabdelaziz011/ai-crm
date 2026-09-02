export const FEATURE_FLAG_SCOPES = [
  "global",
  "plan",
  "company",
  "branch",
  "department",
  "role",
  "user",
] as const;

export type FeatureFlagScope = (typeof FEATURE_FLAG_SCOPES)[number];

export const FEATURE_FLAG_ENVIRONMENTS = ["development", "staging", "production"] as const;
export type FeatureFlagEnvironment = (typeof FEATURE_FLAG_ENVIRONMENTS)[number];

/** Canonical feature keys — modules resolve through FeatureFlagReadPort, never hardcoded checks. */
export const PLATFORM_FEATURE_KEYS = [
  "ai.employee",
  "ai.chat",
  "ai.analytics",
  "knowledge.platform",
  "workflow.automation",
  "customer.portal",
  "employee.portal",
  "public.booking",
  "channel.whatsapp",
  "channel.instagram",
  "channel.facebook",
  "channel.voice",
  "dashboard.executive",
  "analytics.advanced",
  "reports.enterprise",
  "leads.management",
  "tasks.management",
  "operations.workspace",
  "call.center",
  "omnichannel",
  "tool.calling",
  "embeddings",
] as const;

export type PlatformFeatureKey = (typeof PLATFORM_FEATURE_KEYS)[number];

const PLATFORM_FEATURE_KEY_SET = new Set<string>(PLATFORM_FEATURE_KEYS);

/** True when the key is a registered platform feature flag (runtime/security-sensitive). */
export function isRegisteredPlatformFeatureKey(
  featureKey: string,
): featureKey is PlatformFeatureKey {
  return PLATFORM_FEATURE_KEY_SET.has(featureKey);
}

/** Maps legacy platform_ai_feature_flags keys to unified keys. */
export const LEGACY_AI_FEATURE_KEY_MAP: Readonly<Record<string, PlatformFeatureKey>> = Object.freeze({
  knowledge: "knowledge.platform",
  automation: "workflow.automation",
  ai_chat: "ai.chat",
  ai_agents: "ai.employee",
  ai_analytics: "ai.analytics",
  tool_calling: "tool.calling",
  embeddings: "embeddings",
  voice: "channel.voice",
});
