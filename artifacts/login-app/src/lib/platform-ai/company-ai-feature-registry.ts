/** @deprecated Import from `@/lib/platform-ai` instead. */
export {
  AI_CAPABILITY_CATALOG as COMPANY_AI_FEATURE_REGISTRY,
} from "./ai-capability-catalog";

export {
  AI_CAPABILITY_CATEGORIES as COMPANY_AI_FEATURE_CATEGORIES,
  AI_CAPABILITY_CATEGORY_LABEL_KEYS as COMPANY_AI_FEATURE_CATEGORY_LABEL_KEYS,
  type AiCapabilityCatalogSummary as CompanyAiSummary,
  type AiCapabilityCategory as CompanyAiFeatureCategory,
  type AiCapabilityDefinition as CompanyAiFeatureDefinition,
  type AiCapabilityGroups as CompanyAiFeatureGroups,
  type ResolvedAiCapability as ResolvedCompanyAiFeature,
} from "./ai-capability-catalog-schema";

export {
  buildAiCapabilityCatalogSummary as buildCompanyAiSummary,
  getLiveBackendFeatureKey,
  groupAiCapabilities as groupCompanyAiFeatures,
  resolveAiCapabilities as resolveCompanyAiFeatures,
} from "./resolve-ai-capabilities";
