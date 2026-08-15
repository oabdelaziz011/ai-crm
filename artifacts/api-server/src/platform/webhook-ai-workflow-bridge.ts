import type { ExecutionContext } from "@workspace/automation-platform";
import type {
  AIWorkflowAutomationContext,
  AIWorkflowKnowledgeRetrievalPort,
  EnterpriseRuntimeLike,
} from "@workspace/ai-workflow-platform";
import {
  createAIWorkflowPlatformServices,
  wrapAutomationActionHandlerWithAIWorkflow,
} from "@workspace/ai-workflow-platform";
import {
  AutomationNodeRegistry,
  createBuiltInAutomationNodeHandlers,
  type AutomationActionDeps,
  type AutomationNodeHandler,
} from "@workspace/automation-platform";
import type { KnowledgeProvider } from "@workspace/retrieval-engine";

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

export type CreateWebhookAIWorkflowRegistryOptions = {
  actionDeps: AutomationActionDeps;
  enterpriseRuntime: EnterpriseRuntimeLike;
  knowledge?: KnowledgeProvider;
};

/**
 * Built-in automation handlers with AI Extract / Decision / Summarizer / Knowledge
 * actions routed through the enterprise AI runtime (WhatsApp webhook path).
 */
export function createWebhookAIWorkflowAutomationRegistry(
  options: CreateWebhookAIWorkflowRegistryOptions,
): AutomationNodeRegistry {
  const aiServices = createAIWorkflowPlatformServices({
    runtime: options.enterpriseRuntime,
    knowledge: options.knowledge
      ? createWebhookAIWorkflowKnowledgePort(options.knowledge)
      : undefined,
  });

  const bridge = aiServices.createRuntimeBridge((automationContext) => ({
    userId: null,
    companyId: automationContext.company.id,
    isSuperAdmin: true,
    hasPermission: () => true,
    isWorkflowFeatureEnabled: () => true,
    isAiChatFeatureEnabled: () => true,
    isToolCallingFeatureEnabled: () => true,
    isKnowledgeFeatureEnabled: () => true,
    isEmbeddingsFeatureEnabled: () => true,
    hasLlmTools: () => false,
  }));

  const handlers = createBuiltInAutomationNodeHandlers(options.actionDeps).map((handler) => {
    if (handler.type !== "action") return handler;
    return wrapAutomationActionHandlerWithAIWorkflow(
      handler as Extract<AutomationNodeHandler, { type: "action" }>,
      bridge,
      toAIWorkflowAutomationContext,
    );
  });

  return new AutomationNodeRegistry().registerMany(handlers);
}
