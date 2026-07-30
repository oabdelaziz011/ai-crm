import type { AIGatewayService } from "@workspace/ai-provider-layer";
import type { PromptRuntimeService, ServiceContext as PromptServiceContext } from "@workspace/ai-prompt-orchestrator";
import type { KnowledgeProvider } from "@workspace/retrieval-engine";
import type {
  PlatformRuntimeConfigPort,
  RuntimeGatewayPort,
  RuntimePromptPort,
  RuntimeToolPort,
} from "../ports/runtime-ports.js";
import type {
  RuntimeKnowledgePort,
  RuntimeKnowledgeQueryInput,
} from "../ports/knowledge-port.js";
import type { ServiceContext } from "../types.js";

export function createRuntimeGatewayPort(gateway: AIGatewayService): RuntimeGatewayPort {
  return {
    async chatCompletion(input) {
      const response = await gateway.chatCompletion({
        messages: input.messages,
        providerKey: input.providerKey,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP,
        metadata: input.metadata,
        tools: input.tools,
        context: {
          companyId: input.context.companyId,
          tenantId: input.context.tenantId,
          workflowId: input.context.workflowId,
          executionId: input.context.executionId,
          conversationId: input.context.conversationId,
          userId: input.context.userId,
        },
      });
      return {
        text: response.text,
        model: response.model,
        providerKey: response.providerKey,
        finishReason: response.finishReason,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens,
        },
        latencyMs: response.latencyMs,
        estimatedCostUsd: response.estimatedCostUsd,
        toolCalls: response.toolCalls,
      };
    },
    streamChatCompletion(input) {
      return gateway.streamChatCompletion({
        messages: input.messages,
        providerKey: input.providerKey,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP,
        metadata: input.metadata,
        tools: input.tools,
        context: {
          companyId: input.context.companyId,
          tenantId: input.context.tenantId,
          workflowId: input.context.workflowId,
          executionId: input.context.executionId,
          conversationId: input.context.conversationId,
          userId: input.context.userId,
        },
      });
    },
  };
}

export function createRuntimePromptPort(promptRuntime: PromptRuntimeService): RuntimePromptPort {
  return {
    async execute(ctx, input) {
      const result = await promptRuntime.execute(ctx as PromptServiceContext, {
        companyId: input.companyId,
        conversationId: input.conversationId,
        templateKey: input.templateKey,
        templateType: input.templateType as never,
        mode: input.mode,
        currentUserMessage: input.currentUserMessage,
        toolsEnabled: input.toolsEnabled,
        context: input.context as never,
      });
      return {
        builtPrompt: {
          buildId: result.builtPrompt.build_id,
          templateKey: result.builtPrompt.template_key,
          templateVersionId: result.builtPrompt.template_version_id,
          finalPrompt: result.builtPrompt.final_prompt,
          gatewayMessages: result.builtPrompt.gateway_messages,
          messagePlan: {
            mode: result.builtPrompt.message_plan.mode,
            outputContract: result.builtPrompt.message_plan.outputContract,
          },
          metadata: result.builtPrompt.metadata,
        },
      };
    },
  };
}

export function createRuntimeKnowledgePort(knowledge: KnowledgeProvider): RuntimeKnowledgePort {
  return {
    async retrieve(ctx: ServiceContext, input: RuntimeKnowledgeQueryInput) {
      const result = await knowledge.retrieve(ctx as never, input);
      return {
        contextText: result.contextText,
        chunks: result.chunks.map((chunk) => ({
          id: chunk.id,
          content: chunk.content,
          score: chunk.score,
          rank: chunk.rank,
          tokenCount: chunk.tokenCount,
        })),
        citations: result.citations.map((citation) => ({
          citationId: citation.citationId,
          chunkId: citation.chunkId,
          documentId: citation.documentId,
          documentTitle: citation.documentTitle,
          sectionTitle: citation.sectionTitle,
          confidence: citation.confidence,
        })),
        confidence: result.confidence,
        searchMode: result.searchMode,
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

export function createEnterpriseRuntimeIntegrations(deps: {
  promptRuntime: PromptRuntimeService;
  gateway: AIGatewayService;
  knowledge?: KnowledgeProvider;
  tools?: RuntimeToolPort;
  platformConfig?: PlatformRuntimeConfigPort;
}) {
  return {
    prompt: createRuntimePromptPort(deps.promptRuntime),
    gateway: createRuntimeGatewayPort(deps.gateway),
    knowledge: deps.knowledge ? createRuntimeKnowledgePort(deps.knowledge) : undefined,
    tools: deps.tools,
    platformConfig: deps.platformConfig,
  };
}
