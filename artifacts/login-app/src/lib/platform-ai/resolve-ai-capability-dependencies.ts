import {
  resolveCatalogFeatureEnabled,
  type PlatformAIFeatureFlagRecord,
} from "@workspace/platform-ai-provider";
import type { PlanTier } from "@/lib/types";
import { getAiCapabilityById } from "./ai-capability-catalog";
import type {
  AiCapabilityDefinition,
  AiCapabilityDependencyResolution,
  ResolvedAiCapability,
} from "./ai-capability-catalog-schema";
import { PLAN_TIER_RANK } from "./ai-capability-catalog-schema";

export function normalizePlanTier(value: string | null | undefined): PlanTier | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "basic") return "Basic";
  if (normalized === "pro") return "Pro";
  if (normalized === "enterprise") return "Enterprise";
  if (value === "Basic" || value === "Pro" || value === "Enterprise") return value;
  return null;
}

export function companyMeetsMinimumPlan(
  companyPlanTier: PlanTier | null,
  minimumPlan: PlanTier | null | undefined,
): boolean {
  // Phase 7.3: package name tiers must NOT gate AI capabilities.
  // Commercial access is company_feature_overrides → is_feature_enabled; flags are kill-switches.
  if (!minimumPlan) return true;
  if (!companyPlanTier) return false;
  return PLAN_TIER_RANK[companyPlanTier] >= PLAN_TIER_RANK[minimumPlan];
}

function resolveBackendEnabled(
  definition: AiCapabilityDefinition,
  featureFlags: PlatformAIFeatureFlagRecord[],
): boolean {
  if (definition.availability !== "live" || !definition.backendFeatureKey) {
    return false;
  }

  const flag = featureFlags.find((row) => row.feature_key === definition.backendFeatureKey);
  return resolveCatalogFeatureEnabled(
    definition.backendFeatureKey,
    flag,
    definition.defaultEnabled,
  );
}

function buildEnabledByIdMap(
  catalog: readonly AiCapabilityDefinition[],
  featureFlags: PlatformAIFeatureFlagRecord[],
): Map<string, boolean> {
  const enabledById = new Map<string, boolean>();
  for (const definition of catalog) {
    enabledById.set(definition.id, resolveBackendEnabled(definition, featureFlags));
  }
  return enabledById;
}

export function resolveAiCapabilityDependencies(
  definition: AiCapabilityDefinition,
  enabledById: Map<string, boolean>,
): AiCapabilityDependencyResolution {
  const dependencies = definition.dependencies ?? [];
  const missingDependencyIds = dependencies.filter((dependencyId) => !enabledById.get(dependencyId));

  return {
    satisfied: missingDependencyIds.length === 0,
    missingDependencyIds,
  };
}

export function formatMissingDependencyNames(
  missingDependencyIds: readonly string[],
): string {
  return missingDependencyIds
    .map((dependencyId) => getAiCapabilityById(dependencyId)?.displayNameKey ?? dependencyId)
    .join(", ");
}

export { buildEnabledByIdMap, resolveBackendEnabled };
