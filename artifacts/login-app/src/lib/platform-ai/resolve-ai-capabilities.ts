import type { PlatformAIFeatureFlagRecord } from "@workspace/platform-ai-provider";
import type { PlanTier } from "@/lib/types";
import { AI_CAPABILITY_CATALOG } from "./ai-capability-catalog";
import type {
  AiCapabilityCatalogSummary,
  AiCapabilityGroups,
  AiCapabilityState,
  ResolvedAiCapability,
} from "./ai-capability-catalog-schema";
import { AI_CAPABILITY_CATEGORIES } from "./ai-capability-catalog-schema";
import { getAiCapabilityById } from "./ai-capability-catalog";
import {
  buildEnabledByIdMap,
  companyMeetsMinimumPlan,
  normalizePlanTier,
  resolveAiCapabilityDependencies,
  resolveBackendEnabled,
} from "./resolve-ai-capability-dependencies";
import { resolveAiCapabilityState } from "./resolve-ai-capability-state";

export type ResolveAiCapabilitiesInput = {
  featureFlags: PlatformAIFeatureFlagRecord[];
  companyPlanTier: PlanTier | null;
  companyPlanLabel: string | null;
};

export function resolveAiCapabilities({
  featureFlags,
  companyPlanTier,
}: ResolveAiCapabilitiesInput): ResolvedAiCapability[] {
  const visibleCatalog = AI_CAPABILITY_CATALOG.filter((capability) => capability.visible !== false);
  const enabledById = buildEnabledByIdMap(visibleCatalog, featureFlags);

  return visibleCatalog.map((definition) =>
    resolveAiCapabilityState({
      definition,
      featureFlags,
      companyPlanTier,
      enabledById,
      dependencyResolution: resolveAiCapabilityDependencies(definition, enabledById),
    }),
  );
}

export function groupAiCapabilities(capabilities: ResolvedAiCapability[]): AiCapabilityGroups {
  const groups: AiCapabilityGroups = {
    core: [],
    communication: [],
    intelligence: [],
    advanced: [],
  };

  for (const capability of capabilities) {
    groups[capability.category].push(capability);
  }

  return groups;
}

export function buildAiCapabilityCatalogSummary(
  capabilities: ResolvedAiCapability[],
  companyPlanLabel: string | null,
  featureFlags: PlatformAIFeatureFlagRecord[],
): AiCapabilityCatalogSummary {
  const liveCapabilities = capabilities.filter(
    (capability) => capability.availability === "live" && capability.backendFeatureKey,
  );
  const enabledFeatureCount = liveCapabilities.filter((capability) => capability.state === "enabled").length;

  const lastUpdatedAt =
    featureFlags.length > 0
      ? featureFlags.reduce<string | null>((latest, flag) => {
          if (!latest || flag.updated_at > latest) return flag.updated_at;
          return latest;
        }, null)
      : null;

  return {
    statusKey:
      enabledFeatureCount > 0
        ? "platformAi.admin.companySummary.statusActive"
        : "platformAi.admin.companySummary.statusInactive",
    planLabel: companyPlanLabel,
    planTier: companyPlanLabel ? normalizePlanTier(companyPlanLabel) : null,
    liveFeatureCount: liveCapabilities.length,
    lockedFeatureCount: capabilities.filter((capability) => capability.state === "locked").length,
    comingSoonCount: capabilities.filter((capability) => capability.state === "coming_soon").length,
    betaCount: capabilities.filter((capability) => capability.state === "beta").length,
    enabledFeatureCount,
    lastUpdatedAt,
  };
}

export function getLiveBackendFeatureKey(featureId: string) {
  const definition = getAiCapabilityById(featureId);
  if (!definition || definition.availability !== "live" || !definition.backendFeatureKey) {
    return null;
  }
  return definition.backendFeatureKey;
}

export function resolveCompanyPlanTier(company: {
  plan?: { name: PlanTier } | null;
  subscription_plan?: string | null;
}): PlanTier | null {
  return company.plan?.name ?? normalizePlanTier(company.subscription_plan);
}

export function countCapabilitiesByState(
  capabilities: ResolvedAiCapability[],
  state: AiCapabilityState,
): number {
  return capabilities.filter((capability) => capability.state === state).length;
}

// Re-export state resolver for tests and direct use.
export { resolveAiCapabilityState, resolveBackendEnabled };
