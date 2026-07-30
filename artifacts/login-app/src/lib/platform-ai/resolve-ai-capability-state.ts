import { getAiCapabilityById } from "./ai-capability-catalog";
import type {
  AiCapabilityDefinition,
  AiCapabilityDependencyResolution,
  AiCapabilityState,
  ResolvedAiCapability,
} from "./ai-capability-catalog-schema";
import { companyMeetsMinimumPlan } from "./resolve-ai-capability-dependencies";
import type { PlatformAIFeatureFlagRecord } from "@workspace/platform-ai-provider";
import type { PlanTier } from "@/lib/types";
import { resolveBackendEnabled } from "./resolve-ai-capability-dependencies";

type ResolveAiCapabilityStateInput = {
  definition: AiCapabilityDefinition;
  featureFlags: PlatformAIFeatureFlagRecord[];
  companyPlanTier: PlanTier | null;
  enabledById: Map<string, boolean>;
  dependencyResolution: AiCapabilityDependencyResolution;
};

function missingDependencyReasonParams(
  missingDependencyIds: readonly string[],
): Record<string, string> {
  const labels = missingDependencyIds
    .map((dependencyId) => {
      const dependency = getAiCapabilityById(dependencyId);
      return dependency?.id ?? dependencyId;
    })
    .join(", ");

  return { dependencies: labels };
}

export function resolveAiCapabilityState({
  definition,
  featureFlags,
  companyPlanTier,
  dependencyResolution,
}: ResolveAiCapabilityStateInput): ResolvedAiCapability {
  const enabled = resolveBackendEnabled(definition, featureFlags);
  const planMet = companyMeetsMinimumPlan(companyPlanTier, definition.minimumPlan);
  const hasBackend = definition.availability === "live" && Boolean(definition.backendFeatureKey);
  const isComingSoon = definition.availability === "coming_soon";

  let state: AiCapabilityState;
  let stateReasonKey: string | null = null;
  let stateReasonParams: Record<string, string> | undefined;

  if (!planMet && definition.minimumPlan) {
    state = "locked";
    stateReasonKey = "platformAi.admin.capabilityReasons.planRequired";
    stateReasonParams = { plan: definition.minimumPlan };
  } else if (isComingSoon) {
    state = definition.experimental ? "beta" : "coming_soon";
    if (!dependencyResolution.satisfied) {
      stateReasonKey = "platformAi.admin.capabilityReasons.requiresDependencies";
      stateReasonParams = missingDependencyReasonParams(dependencyResolution.missingDependencyIds);
    } else {
      stateReasonKey = "platformAi.admin.capabilityReasons.notYetAvailable";
    }
  } else if (definition.experimental) {
    state = "beta";
    if (!dependencyResolution.satisfied) {
      stateReasonKey = "platformAi.admin.capabilityReasons.requiresDependencies";
      stateReasonParams = missingDependencyReasonParams(dependencyResolution.missingDependencyIds);
    }
  } else if (!dependencyResolution.satisfied) {
    state = "disabled";
    stateReasonKey = "platformAi.admin.capabilityReasons.requiresDependencies";
    stateReasonParams = missingDependencyReasonParams(dependencyResolution.missingDependencyIds);
  } else if (enabled) {
    state = "enabled";
  } else {
    state = "disabled";
  }

  const canToggle =
    hasBackend &&
    planMet &&
    dependencyResolution.satisfied &&
    !isComingSoon &&
    state !== "locked";

  return {
    ...definition,
    state,
    enabled,
    toggleDisabled: !canToggle,
    canToggle,
    stateReasonKey,
    stateReasonParams,
    dependencyResolution,
  };
}
