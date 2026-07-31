export {
  AI_CAPABILITY_CATALOG,
  getAiCapabilityById,
} from "./ai-capability-catalog";

export {
  AI_CAPABILITY_CATEGORIES,
  AI_CAPABILITY_CATEGORY_LABEL_KEYS,
  AI_CAPABILITY_STATE_LABEL_KEYS,
  PLAN_TIER_RANK,
  type AiCapabilityAvailability,
  type AiCapabilityCatalogSummary,
  type AiCapabilityCategory,
  type AiCapabilityDefinition,
  type AiCapabilityDependencyResolution,
  type AiCapabilityGroups,
  type AiCapabilityState,
  type ResolvedAiCapability,
} from "./ai-capability-catalog-schema";

export {
  companyMeetsMinimumPlan,
  formatMissingDependencyNames,
  normalizePlanTier,
  resolveAiCapabilityDependencies,
} from "./resolve-ai-capability-dependencies";

export {
  buildAiCapabilityCatalogSummary,
  countCapabilitiesByState,
  getLiveBackendFeatureKey,
  groupAiCapabilities,
  resolveAiCapabilities,
  resolveCompanyPlanTier,
  type ResolveAiCapabilitiesInput,
} from "./resolve-ai-capabilities";

export { resolveAiCapabilityState } from "./resolve-ai-capability-state";

export {
  PLATFORM_AI_CAPABILITY_ID,
  PLATFORM_AI_FEATURE_KEY,
  PLATFORM_AI_FEATURE_KEY_AUDIT,
  PLATFORM_AI_CAPABILITY_FEATURE_MAPPINGS,
  getBackendFeatureKeyForCapability,
  resolveCatalogFeatureEnabled,
  resolveRuntimeFeatureEnabled,
} from "@workspace/platform-ai-provider";

export {
  isKnowledgeRetrievalEligible,
  isKnowledgeRouteAccessible,
  shouldShowKnowledgeAssistantTab,
  shouldShowKnowledgeNavigation,
} from "./knowledge-access";

export {
  isAutomationRouteAccessible,
  areWorkflowAiNodesEnabled,
  canViewAutomation,
  shouldShowAutomationNavigation,
} from "./workflow-access";

export {
  canReadAnalytics,
  canReadTraces,
  canViewAnalytics,
  isAnalyticsRouteAccessible,
  shouldShowAnalyticsIntegration,
  shouldShowAnalyticsNavigation,
} from "./analytics-access";

export {
  canExecuteAgents,
  canExecuteAgentWorkflow,
  canManageAgentWorkflows,
  canManageAgents,
  canResumeAgent,
  canStartAgent,
  canViewAgents,
  canResumeAgentWorkflow,
  canStartAgentWorkflow,
  canViewAgentHistory,
  hasAgentsExecutePermission,
  hasAgentsManagePermission,
  hasAgentsViewPermission,
  hasManagePermission,
  isAgentsAccessible,
  shouldShowAgentsNavigation,
} from "./agents-access";

/** @deprecated Use AI_CAPABILITY_CATALOG */
export { AI_CAPABILITY_CATALOG as COMPANY_AI_FEATURE_REGISTRY } from "./ai-capability-catalog";

/** @deprecated Use AI_CAPABILITY_CATEGORIES */
export { AI_CAPABILITY_CATEGORIES as COMPANY_AI_FEATURE_CATEGORIES } from "./ai-capability-catalog-schema";

/** @deprecated Use AI_CAPABILITY_CATEGORY_LABEL_KEYS */
export { AI_CAPABILITY_CATEGORY_LABEL_KEYS as COMPANY_AI_FEATURE_CATEGORY_LABEL_KEYS } from "./ai-capability-catalog-schema";

/** @deprecated Use ResolvedAiCapability */
export type { ResolvedAiCapability as ResolvedCompanyAiFeature } from "./ai-capability-catalog-schema";

/** @deprecated Use AiCapabilityDefinition */
export type { AiCapabilityDefinition as CompanyAiFeatureDefinition } from "./ai-capability-catalog-schema";

/** @deprecated Use AiCapabilityCategory */
export type { AiCapabilityCategory as CompanyAiFeatureCategory } from "./ai-capability-catalog-schema";

/** @deprecated Use AiCapabilityGroups */
export type { AiCapabilityGroups as CompanyAiFeatureGroups } from "./ai-capability-catalog-schema";

/** @deprecated Use AiCapabilityCatalogSummary */
export type { AiCapabilityCatalogSummary as CompanyAiSummary } from "./ai-capability-catalog-schema";

/** @deprecated Use resolveAiCapabilities */
export { resolveAiCapabilities as resolveCompanyAiFeatures } from "./resolve-ai-capabilities";

/** @deprecated Use groupAiCapabilities */
export { groupAiCapabilities as groupCompanyAiFeatures } from "./resolve-ai-capabilities";

/** @deprecated Use buildAiCapabilityCatalogSummary */
export { buildAiCapabilityCatalogSummary as buildCompanyAiSummary } from "./resolve-ai-capabilities";
