import type { LucideIcon } from "lucide-react";
import type { PlatformAIFeatureKey } from "@workspace/platform-ai-provider";
import type { PlanTier } from "@/lib/types";

export type AiCapabilityCategory = "core" | "communication" | "intelligence" | "advanced";

export type AiCapabilityAvailability = "live" | "coming_soon";

export type AiCapabilityState = "enabled" | "disabled" | "locked" | "coming_soon" | "beta";

/**
 * Canonical AI capability catalog entry.
 * Add new capabilities here — UI renders dynamically without component changes.
 */
export type AiCapabilityDefinition = {
  id: string;
  displayNameKey: string;
  descriptionKey: string;
  category: AiCapabilityCategory;
  icon: LucideIcon;
  availability: AiCapabilityAvailability;
  backendFeatureKey?: PlatformAIFeatureKey;
  minimumPlan?: PlanTier | null;
  dependencies?: readonly string[];
  defaultEnabled?: boolean;
  experimental?: boolean;
  /** When false the capability is omitted from the catalog UI. Default: true */
  visible?: boolean;
};

export type AiCapabilityDependencyResolution = {
  satisfied: boolean;
  missingDependencyIds: readonly string[];
};

export type ResolvedAiCapability = AiCapabilityDefinition & {
  state: AiCapabilityState;
  enabled: boolean;
  toggleDisabled: boolean;
  canToggle: boolean;
  stateReasonKey: string | null;
  stateReasonParams?: Record<string, string>;
  dependencyResolution: AiCapabilityDependencyResolution;
};

export type AiCapabilityGroups = Record<AiCapabilityCategory, ResolvedAiCapability[]>;

export type AiCapabilityCatalogSummary = {
  statusKey: "platformAi.admin.companySummary.statusActive" | "platformAi.admin.companySummary.statusInactive";
  planLabel: string | null;
  planTier: PlanTier | null;
  liveFeatureCount: number;
  lockedFeatureCount: number;
  comingSoonCount: number;
  betaCount: number;
  enabledFeatureCount: number;
  lastUpdatedAt: string | null;
};

export const AI_CAPABILITY_CATEGORIES: readonly AiCapabilityCategory[] = [
  "core",
  "communication",
  "intelligence",
  "advanced",
] as const;

export const AI_CAPABILITY_CATEGORY_LABEL_KEYS: Record<AiCapabilityCategory, string> = {
  core: "platformAi.admin.categories.core",
  communication: "platformAi.admin.categories.communication",
  intelligence: "platformAi.admin.categories.intelligence",
  advanced: "platformAi.admin.categories.advanced",
};

export const AI_CAPABILITY_STATE_LABEL_KEYS: Record<AiCapabilityState, string> = {
  enabled: "platformAi.admin.capabilityStates.enabled",
  disabled: "platformAi.admin.capabilityStates.disabled",
  locked: "platformAi.admin.capabilityStates.locked",
  coming_soon: "platformAi.admin.capabilityStates.comingSoon",
  beta: "platformAi.admin.capabilityStates.beta",
};

export const PLAN_TIER_RANK: Record<PlanTier, number> = {
  Basic: 1,
  Pro: 2,
  Enterprise: 3,
};
