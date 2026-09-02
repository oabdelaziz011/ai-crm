import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutionContext } from "@workspace/automation-platform";
import type {
  AIWorkflowAutomationContext,
  AIWorkflowKnowledgeRetrievalPort,
  AIWorkflowServiceContext,
  EnterpriseRuntimeLike,
} from "@workspace/ai-workflow-platform";
import {
  createAIWorkflowPlatformServices,
  WorkflowAiFeatureDisabledError,
  wrapAutomationActionHandlerWithAIWorkflow,
} from "@workspace/ai-workflow-platform";
import {
  AutomationNodeRegistry,
  createBuiltInAutomationNodeHandlers,
  type AutomationActionDeps,
  type AutomationNodeHandler,
} from "@workspace/automation-platform";
import { PLATFORM_AI_FEATURE_KEY, type PlatformAIFeatureKey } from "@workspace/platform-ai-provider";
import type { KnowledgeProvider } from "@workspace/retrieval-engine";
import { requireCompanyFeature } from "../lib/require-company-feature.js";

/** Legacy Platform AI key → unified key (parity with configuration-platform LEGACY_AI_FEATURE_KEY_MAP). */
const LEGACY_AI_TO_UNIFIED: Readonly<Record<string, string>> = Object.freeze({
  automation: "workflow.automation",
  ai_chat: "ai.chat",
  tool_calling: "tool.calling",
  knowledge: "knowledge.platform",
  embeddings: "embeddings",
  ai_agents: "ai.employee",
  ai_analytics: "ai.analytics",
});
export function toAIWorkflowAutomationContext(context: ExecutionContext): AIWorkflowAutomationContext {
  return {
    company: { id: context.company.id },
    flow: { id: context.flow.id },
    run: { id: context.run.id },
    session: { id: context.session.id },
    variables: context.variables,
    customer: { id: context.customer.id },
    currentNode: { config: context.currentNode.config },
    input: context.input,
  };
}

export function createWebhookAIWorkflowKnowledgePort(
  knowledge: KnowledgeProvider,
): AIWorkflowKnowledgeRetrievalPort {
  return {
    async retrieve(ctx, input) {
      const result = await knowledge.retrieve(ctx as never, input);
      return {
        contextText: result.contextText,
        chunks: result.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          score: chunk.score,
          rank: chunk.rank,
          tokenCount: chunk.tokenCount,
          documentTitle: chunk.documentTitle ?? null,
          metadata: chunk.metadata,
        })),
        chunkCount: result.chunkCount,
        totalTokens: result.totalTokens,
        executionId: result.executionId,
        vectorQueryExecutionId: result.vectorQueryExecutionId,
        retrievalLatencyMs: result.retrievalLatencyMs,
        rankingLatencyMs: result.rankingLatencyMs,
        policyId: result.policyId,
      };
    },
  };
}

export type PlatformFeatureEnabledResolver = (
  companyId: string,
  featureKey: PlatformAIFeatureKey,
) => Promise<boolean>;

export type CreateWebhookAIWorkflowRegistryOptions = {
  actionDeps: AutomationActionDeps;
  enterpriseRuntime: EnterpriseRuntimeLike;
  knowledge?: KnowledgeProvider;
  /** Supabase client for authoritative feature resolution (required unless resolver injected). */
  client?: SupabaseClient;
  /**
   * Test/production seam for platform feature resolution.
   * Must fail closed: missing/error/false → false; only explicit true → true.
   */
  resolvePlatformFeatureEnabled?: PlatformFeatureEnabledResolver;
};

/** Unified platform key → commercial billing code (parity with login-app feature-code-map). */
const UNIFIED_TO_BILLING: Readonly<Record<string, string>> = Object.freeze({
  "workflow.automation": "workflow_automation",
  "ai.chat": "ai_assistant",
  "ai.employee": "ai_employee",
  "ai.analytics": "advanced_reports",
});

/**
 * Authoritative Platform AI flag for webhook runtime:
 * commercial entitlement (when mapped) AND platform_ai_feature_enabled RPC.
 * Fail-closed on missing company / RPC error / non-true.
 */
export function createWebhookPlatformFeatureResolver(
  client: SupabaseClient,
): PlatformFeatureEnabledResolver {
  return async (companyId, featureKey) => {
    const scoped = companyId?.trim() ?? "";
    if (!scoped) return false;
    try {
      const unified = LEGACY_AI_TO_UNIFIED[featureKey] ?? featureKey;
      const billingCode = UNIFIED_TO_BILLING[unified] ?? null;
      if (billingCode) {
        try {
          await requireCompanyFeature(scoped, billingCode);
        } catch {
          return false;
        }
      }

      const { data, error } = await client.rpc("platform_ai_feature_enabled", {
        p_company_id: scoped,
        p_feature_key: featureKey,
      });
      if (error) return false;
      return data === true;
    } catch {
      return false;
    }
  };
}

export async function resolveWebhookAiServiceContext(
  companyId: string | null | undefined,
  resolvePlatformFeatureEnabled: PlatformFeatureEnabledResolver,
): Promise<AIWorkflowServiceContext> {
  const scopedCompanyId = companyId?.trim() ?? "";
  if (!scopedCompanyId) {
    throw new WorkflowAiFeatureDisabledError("Missing company context for workflow AI.");
  }

  const keys = [
    PLATFORM_AI_FEATURE_KEY.AUTOMATION,
    PLATFORM_AI_FEATURE_KEY.AI_CHAT,
    PLATFORM_AI_FEATURE_KEY.TOOL_CALLING,
    PLATFORM_AI_FEATURE_KEY.KNOWLEDGE,
    PLATFORM_AI_FEATURE_KEY.EMBEDDINGS,
  ] as const;

  const resolved = await Promise.all(
    keys.map(async (key) => {
      try {
        return (await resolvePlatformFeatureEnabled(scopedCompanyId, key)) === true;
      } catch {
        return false;
      }
    }),
  );

  const [workflow, aiChat, toolCalling, knowledge, embeddings] = resolved;

  return {
    userId: null,
    companyId: scopedCompanyId,
    isSuperAdmin: false,
    hasPermission: () => false,
    isWorkflowFeatureEnabled: () => workflow,
    isAiChatFeatureEnabled: () => aiChat,
    isToolCallingFeatureEnabled: () => toolCalling,
    isKnowledgeFeatureEnabled: () => knowledge,
    isEmbeddingsFeatureEnabled: () => embeddings,
    hasLlmTools: () => false,
  };
}

/**
 * Built-in automation handlers with AI Extract / Decision / Summarizer / Knowledge
 * actions routed through the enterprise AI runtime (WhatsApp webhook path).
 *
 * Does NOT fabricate super-admin or feature=true. Feature callbacks are resolved
 * from commercial entitlement (when mapped) AND platform_ai_feature_enabled RPC.
 */
export function createWebhookAIWorkflowAutomationRegistry(
  options: CreateWebhookAIWorkflowRegistryOptions,
): AutomationNodeRegistry {
  const resolvePlatformFeatureEnabled =
    options.resolvePlatformFeatureEnabled ??
    (options.client ? createWebhookPlatformFeatureResolver(options.client) : null);

  if (!resolvePlatformFeatureEnabled) {
    throw new Error(
      "createWebhookAIWorkflowAutomationRegistry requires client or resolvePlatformFeatureEnabled",
    );
  }

  const aiServices = createAIWorkflowPlatformServices({
    runtime: options.enterpriseRuntime,
    knowledge: options.knowledge
      ? createWebhookAIWorkflowKnowledgePort(options.knowledge)
      : undefined,
  });

  const bridge = aiServices.createRuntimeBridge((automationContext) => ({
    userId: null,
    companyId: automationContext.company.id?.trim() || null,
    isSuperAdmin: false,
    hasPermission: () => false,
    // Placeholders — real values applied in async execute wrapper below.
    // Fail-closed if sync path is ever invoked without wrapper: missing → DENY.
    isWorkflowFeatureEnabled: undefined,
    isAiChatFeatureEnabled: undefined,
    isToolCallingFeatureEnabled: undefined,
    isKnowledgeFeatureEnabled: undefined,
    isEmbeddingsFeatureEnabled: undefined,
    hasLlmTools: () => false,
  }));

  const handlers = createBuiltInAutomationNodeHandlers(options.actionDeps).map((handler) => {
    if (handler.type !== "action") return handler;
    const wrapped = wrapAutomationActionHandlerWithAIWorkflow(
      handler as Extract<AutomationNodeHandler, { type: "action" }>,
      bridge,
      toAIWorkflowAutomationContext,
    );

    return {
      ...wrapped,
      async execute(context: ExecutionContext) {
        const config = context.currentNode.config;
        if (!bridge.isAIWorkflowNode(config)) {
          return wrapped.execute(context);
        }

        const automationContext = toAIWorkflowAutomationContext(context);
        const serviceContext = await resolveWebhookAiServiceContext(
          automationContext.company.id,
          resolvePlatformFeatureEnabled,
        );

        return aiServices.executor.execute(automationContext, serviceContext);
      },
    };
  });

  return new AutomationNodeRegistry().registerMany(handlers);
}
