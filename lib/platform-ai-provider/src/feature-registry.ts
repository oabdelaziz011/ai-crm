import { PLATFORM_AI_CAPABILITY_ID } from "./capability-ids.js";
import { PLATFORM_AI_FEATURE_KEY, type PlatformAIFeatureKey } from "./feature-keys.js";

/**
 * Platform AI feature key audit registry (Sprint 1).
 *
 * Work item A — documents catalog id, DB key, runtime usage, and ops usage per key.
 * This is documentation-as-code; it does not wire enforcement.
 */

export type PlatformAIFeatureKeyAuditEntry = {
  featureKey: PlatformAIFeatureKey;
  databaseKey: PlatformAIFeatureKey;
  catalogCapabilityId: string | null;
  responsibility: string;
  runtimeUsage: readonly string[];
  opsUsage: readonly string[];
  /** Sprint 1: whether runtime RPC/guards read this key today. */
  runtimeEnforcedToday: boolean;
};

export const PLATFORM_AI_FEATURE_KEY_AUDIT: Record<PlatformAIFeatureKey, PlatformAIFeatureKeyAuditEntry> =
  {
    [PLATFORM_AI_FEATURE_KEY.AI_CHAT]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.AI_CHAT,
      databaseKey: PLATFORM_AI_FEATURE_KEY.AI_CHAT,
      catalogCapabilityId: PLATFORM_AI_CAPABILITY_ID.AI_CHAT,
      responsibility:
        "Core tenant AI chat and default LLM use case (`chat`). Gates platform-managed provider resolution and chat workspace readiness.",
      runtimeUsage: [
        "platform_resolve_ai_runtime_config → use_case chat (default)",
        "login-app useRuntimeChatConfig → isFeatureEnabled(ai_chat)",
        "enterprise-ai-runtime-service → chat use case when no tool loop",
      ],
      opsUsage: [
        "platform_ai_ops_company_feature_matrix → ai_chat column",
        "Platform AI Operations → ops-feature-flags matrix",
      ],
      runtimeEnforcedToday: true,
    },
    [PLATFORM_AI_FEATURE_KEY.TOOL_CALLING]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.TOOL_CALLING,
      databaseKey: PLATFORM_AI_FEATURE_KEY.TOOL_CALLING,
      catalogCapabilityId: PLATFORM_AI_CAPABILITY_ID.WORKFLOW_AI,
      responsibility:
        "Agentic tool-loop LLM use case. Distinct from automation UI access — enforced only when runtime executes a tool loop.",
      runtimeUsage: [
        "platform_resolve_ai_runtime_config → use_case tool_calling",
        "enterprise-ai-runtime-service → tool_calling when tools + conversationId present",
      ],
      opsUsage: ["platform_ai_ops_company_feature_matrix → tool_calling column"],
      runtimeEnforcedToday: true,
    },
    [PLATFORM_AI_FEATURE_KEY.KNOWLEDGE]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
      databaseKey: PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
      catalogCapabilityId: PLATFORM_AI_CAPABILITY_ID.KNOWLEDGE_BASE,
      responsibility:
        "Tenant knowledge-base product capability (sources, documents, RAG admin). Stored per company; not read by runtime guards today — access is RBAC + assistant settings.",
      runtimeUsage: [
        "login-app knowledge routes and sidebar → isFeatureEnabled(knowledge)",
        "login-app useRuntimeChatConfig → knowledge retrieval gate",
        "@workspace/knowledge-platform services → assertKnowledgeFeatureEnabled",
        "Related indexing path uses embeddings key via platform_resolve_ai_runtime_config",
      ],
      opsUsage: ["platform_ai_ops_company_feature_matrix → knowledge column"],
      runtimeEnforcedToday: true,
    },
    [PLATFORM_AI_FEATURE_KEY.AUTOMATION]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.AUTOMATION,
      databaseKey: PLATFORM_AI_FEATURE_KEY.AUTOMATION,
      catalogCapabilityId: PLATFORM_AI_CAPABILITY_ID.WORKFLOW_AI,
      responsibility:
        "Workflow / automation builder product capability. Stored per company; not read by runtime guards today — access is RBAC on automation routes and tables.",
      runtimeUsage: [
        "login-app automation routes and sidebar → isFeatureEnabled(automation)",
        "@workspace/automation-platform services → assertWorkflowFeatureEnabled",
        "@workspace/ai-workflow-platform executor → layered composite policy",
        "login-app legacy automation CRUD/run/schedule → workflow guard",
      ],
      opsUsage: ["platform_ai_ops_company_feature_matrix → automation column"],
      runtimeEnforcedToday: true,
    },
    [PLATFORM_AI_FEATURE_KEY.VOICE]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.VOICE,
      databaseKey: PLATFORM_AI_FEATURE_KEY.VOICE,
      catalogCapabilityId: null,
      responsibility:
        "Future voice AI channel / audio use case. Reserved in DB and ops matrix; no tenant runtime enforcement yet.",
      runtimeUsage: ["Not enforced (Sprint 1)"],
      opsUsage: ["platform_ai_ops_company_feature_matrix → voice column (defaults false when missing)"],
      runtimeEnforcedToday: false,
    },
    [PLATFORM_AI_FEATURE_KEY.EMBEDDINGS]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.EMBEDDINGS,
      databaseKey: PLATFORM_AI_FEATURE_KEY.EMBEDDINGS,
      catalogCapabilityId: null,
      responsibility:
        "Platform embedding model resolution for knowledge indexing and retrieval (`embeddings` use case). Coupled to knowledge pipeline, not the knowledge admin UI flag.",
      runtimeUsage: [
        "platform_resolve_ai_runtime_config → use_case embeddings",
        "login-app retrieval-engine → resolveRuntimeConfig(..., embeddings)",
      ],
      opsUsage: ["Not shown in ops feature matrix (Sprint 1)"],
      runtimeEnforcedToday: true,
    },
    [PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS]: {
      featureKey: PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS,
      databaseKey: PLATFORM_AI_FEATURE_KEY.AI_ANALYTICS,
      catalogCapabilityId: PLATFORM_AI_CAPABILITY_ID.AI_ANALYTICS,
      responsibility:
        "AI observability / analytics dashboards (executions, traces). Tenant toggle gates routes, sidebar, and read paths; telemetry ingestion remains ungated.",
      runtimeUsage: [
        "login-app ai-analytics route and sidebar → isFeatureEnabled(ai_analytics)",
        "@workspace/ai-observability read services → assertAnalyticsFeatureEnabled",
      ],
      opsUsage: ["Not shown in ops feature matrix (Sprint 5)"],
      runtimeEnforcedToday: true,
    },
  };

/** Ordered audit list for tooling and tests. */
export const PLATFORM_AI_FEATURE_AUDIT_LIST: readonly PlatformAIFeatureKeyAuditEntry[] =
  Object.values(PLATFORM_AI_FEATURE_KEY_AUDIT);
