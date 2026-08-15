import type { AIWorkflowExecutionAdapter } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowServiceContext } from "../adapters/ai-workflow-execution-adapter.js";
import type { AIWorkflowKnowledgeRetrievalPort } from "../adapters/knowledge-retrieval-port.js";
import type { AIWorkflowRegistryBundle } from "../registries/index.js";
import {
  fromAIWorkflowEngineConfig,
  isAIWorkflowEngineConfig,
  normalizeAIWorkflowNodeConfig,
  type AIWorkflowNodeConfig,
} from "../types/configuration.js";
import type { AIWorkflowExecutionResult } from "../types/metadata.js";
import type { AIWorkflowAutomationContext } from "../types/automation-context.js";
import { BaseAIWorkflowNode } from "../nodes/base-ai-workflow-node.js";
import type { AIWorkflowObservability } from "../observability/ai-workflow-observability.js";
import { assertWorkflowAiNodeExecutionAllowed } from "../utils/workflow-guards.js";

export class AIWorkflowNodeExecutor {
  constructor(
    private readonly deps: {
      registries: AIWorkflowRegistryBundle;
      adapter: AIWorkflowExecutionAdapter;
      knowledge?: AIWorkflowKnowledgeRetrievalPort;
      nodes?: Map<string, BaseAIWorkflowNode>;
      observability?: AIWorkflowObservability;
    },
  ) {}

  resolveConfig(context: AIWorkflowAutomationContext): AIWorkflowNodeConfig | null {
    return fromAIWorkflowEngineConfig(context.currentNode.config);
  }

  async execute(
    context: AIWorkflowAutomationContext,
    serviceContext: AIWorkflowServiceContext,
  ): Promise<import("../types/automation-context.js").AIWorkflowNodeExecutionResult> {
    const config = this.resolveConfig(context);
    if (!config) {
      throw new Error("AI workflow node config is missing.");
    }

    const nodeImpl = this.deps.nodes?.get(config.nodeKey);
    const definition = this.deps.registries.nodes.has(config.nodeKey)
      ? this.deps.registries.nodes.get(config.nodeKey)
      : null;

    this.record({
      type: "node_started",
      nodeKey: config.nodeKey,
      workflowId: context.flow.id,
      executionId: context.run.id,
      companyId: context.company.id,
      promptTemplateKey: config.promptTemplateKey ?? null,
    });

    const validation = nodeImpl
      ? { valid: nodeImpl.validateConfig(config, this.deps.registries).every((issue) => issue.severity !== "error"), issues: nodeImpl.validateConfig(config, this.deps.registries) }
      : this.deps.registries.validation.validate(config, {
          nodeKey: config.nodeKey,
          capabilities: definition?.capabilities,
          hasProviderResolver: true,
        });

    if (!validation.valid) {
      const message = validation.issues.find((issue) => issue.severity === "error")?.message ?? "Invalid AI node configuration.";
      this.record({
        type: "node_failed",
        nodeKey: config.nodeKey,
        workflowId: context.flow.id,
        executionId: context.run.id,
        companyId: context.company.id,
        errorMessage: message,
      });
      return { outcome: "failed", errorMessage: message };
    }

    try {
      const preparedConfig = nodeImpl
        ? nodeImpl.prepareConfig(config, { automation: context, serviceContext })
        : this.deps.registries.configurations.resolve(config.nodeKey, config);

      nodeImpl?.onPrepared((event) => this.record(event), preparedConfig, context);

      if (this.isRetrievalOnlyNode(definition, preparedConfig)) {
        assertWorkflowAiNodeExecutionAllowed(serviceContext, {
          nodeKey: preparedConfig.nodeKey,
          conversationId: context.session.id,
        });
        return this.executeRetrievalNode(context, serviceContext, preparedConfig, nodeImpl);
      }

      assertWorkflowAiNodeExecutionAllowed(serviceContext, {
        nodeKey: preparedConfig.nodeKey,
        conversationId: context.session.id,
      });

      this.record({
        type: "prompt_rendered",
        nodeKey: preparedConfig.nodeKey,
        workflowId: context.flow.id,
        executionId: context.run.id,
        companyId: context.company.id,
        promptTemplateKey: preparedConfig.promptTemplateKey ?? null,
        metadata: nodeImpl?.buildPromptContext(preparedConfig, context) ?? {},
      });

      const request = this.buildExecutionRequest(context, preparedConfig, nodeImpl);
      this.record({
        type: "gateway_started",
        nodeKey: preparedConfig.nodeKey,
        workflowId: context.flow.id,
        executionId: context.run.id,
        companyId: context.company.id,
        providerKey: preparedConfig.providerKey ?? null,
        model: preparedConfig.model ?? null,
      });

      const runtimeResult = await this.deps.adapter.execute(serviceContext, request);

      this.record({
        type: "gateway_completed",
        nodeKey: preparedConfig.nodeKey,
        workflowId: context.flow.id,
        executionId: runtimeResult.executionId,
        companyId: context.company.id,
        providerKey: runtimeResult.providerKey,
        model: runtimeResult.model,
        latencyMs: runtimeResult.latencyMs,
        tokenUsage: {
          promptTokens: runtimeResult.tokenUsage.prompt_tokens,
          completionTokens: runtimeResult.tokenUsage.completion_tokens,
          totalTokens: runtimeResult.tokenUsage.total_tokens,
        },
        estimatedCostUsd: runtimeResult.estimatedCostUsd,
        knowledgeUsed: preparedConfig.knowledge?.enabled === true,
      });

      const mapped = this.deps.registries.outputMappers.map(runtimeResult.responseText, preparedConfig);
      const executionResult: AIWorkflowExecutionResult = {
        rawText: runtimeResult.responseText,
        mapped,
        metadata: {
          executionId: runtimeResult.executionId,
          executionTimeMs: runtimeResult.latencyMs,
          gatewayLatencyMs: runtimeResult.gatewayLatencyMs,
          providerKey: runtimeResult.providerKey,
          model: runtimeResult.model,
          promptVersionId: runtimeResult.promptVersionId,
          promptBuildId: runtimeResult.promptBuildId,
          promptTemplateKey: preparedConfig.promptTemplateKey ?? null,
          tokenUsage: {
            promptTokens: runtimeResult.tokenUsage.prompt_tokens,
            completionTokens: runtimeResult.tokenUsage.completion_tokens,
            totalTokens: runtimeResult.tokenUsage.total_tokens,
          },
          estimatedCostUsd: runtimeResult.estimatedCostUsd,
          knowledgeUsed: preparedConfig.knowledge?.enabled === true,
          knowledgeChunkCount: runtimeResult.knowledgeChunkCount ?? 0,
          streaming: preparedConfig.policies?.streaming === true,
          outputMode: preparedConfig.outputMode,
          cacheHit: runtimeResult.cacheHit,
          status: "success",
        },
      };

      const output = nodeImpl?.mapResult(executionResult, preparedConfig) ?? executionResult.mapped;
      executionResult.metadata = nodeImpl?.enrichRuntimeMetadata(
        executionResult.metadata,
        executionResult,
        output,
        preparedConfig,
      ) ?? executionResult.metadata;
      nodeImpl?.onResultMapped((event) => this.record(event), executionResult, output, preparedConfig);
      const outputVariable = preparedConfig.outputVariable ?? `ai_${preparedConfig.nodeKey}`;

      this.record({
        type: "node_completed",
        nodeKey: preparedConfig.nodeKey,
        workflowId: context.flow.id,
        executionId: runtimeResult.executionId,
        companyId: context.company.id,
        promptTemplateKey: preparedConfig.promptTemplateKey ?? null,
        providerKey: runtimeResult.providerKey,
        model: runtimeResult.model,
        latencyMs: runtimeResult.latencyMs,
        tokenUsage: executionResult.metadata.tokenUsage,
        estimatedCostUsd: runtimeResult.estimatedCostUsd,
        knowledgeUsed: executionResult.metadata.knowledgeUsed,
      });

      return {
        outcome: "continue",
        variables: {
          ...context.variables,
          [outputVariable]: output,
          __aiLastExecution: executionResult.metadata,
        },
        output: {
          aiNodeKey: preparedConfig.nodeKey,
          outputVariable,
          result: output,
          metadata: executionResult.metadata,
        },
      };
    } catch (error) {
      const message = readUnknownErrorMessage(error, "AI workflow node execution failed.");
      this.record({
        type: "node_failed",
        nodeKey: config.nodeKey,
        workflowId: context.flow.id,
        executionId: context.run.id,
        companyId: context.company.id,
        errorMessage: message,
      });
      return { outcome: "failed", errorMessage: message };
    }
  }

  private isRetrievalOnlyNode(
    definition: import("../types/configuration.js").AIWorkflowNodeDefinition | null | undefined,
    config: AIWorkflowNodeConfig,
  ): boolean {
    const nodeImpl = this.deps.nodes?.get(config.nodeKey);
    return (
      definition?.capabilities.includes("retrievalOnly") === true ||
      nodeImpl?.definition.capabilities.includes("retrievalOnly") === true
    );
  }

  private async executeRetrievalNode(
    context: AIWorkflowAutomationContext,
    serviceContext: AIWorkflowServiceContext,
    preparedConfig: AIWorkflowNodeConfig,
    nodeImpl: BaseAIWorkflowNode | undefined,
  ): Promise<import("../types/automation-context.js").AIWorkflowNodeExecutionResult> {
    if (!this.deps.knowledge) {
      throw new Error("Knowledge retrieval port is not configured for retrieval-only AI workflow nodes.");
    }
    if (!nodeImpl) {
      throw new Error(`Retrieval node implementation missing for ${preparedConfig.nodeKey}.`);
    }

    const question =
      nodeImpl.buildRetrievalQuery(preparedConfig, context) ||
      String(
        (nodeImpl.buildPromptContext(preparedConfig, context).knowledgeSearch as { query?: string } | undefined)?.query ??
          "",
      ).trim();

    if (!question) {
      throw new Error("Knowledge search query is empty.");
    }

    this.record({
      type: "retrieval_started",
      nodeKey: preparedConfig.nodeKey,
      workflowId: context.flow.id,
      executionId: context.run.id,
      companyId: context.company.id,
      metadata: { questionPreview: question.slice(0, 180) },
    });

    const retrievalInput = nodeImpl.buildKnowledgeRetrievalInput(preparedConfig, context, question);
    const retrievalResult = await this.deps.knowledge.retrieve(serviceContext, retrievalInput);

    this.record({
      type: "retrieval_completed",
      nodeKey: preparedConfig.nodeKey,
      workflowId: context.flow.id,
      executionId: retrievalResult.executionId,
      companyId: context.company.id,
      latencyMs: retrievalResult.retrievalLatencyMs,
      knowledgeUsed: true,
      metadata: {
        chunkCount: retrievalResult.chunkCount,
        vectorQueryExecutionId: retrievalResult.vectorQueryExecutionId,
      },
    });

    nodeImpl.onRetrievalCompleted((event) => this.record(event), retrievalResult, preparedConfig);

    const output = nodeImpl.mapRetrievalResult(retrievalResult, preparedConfig);
    const metadata = nodeImpl.enrichRetrievalMetadata(
      {
        executionId: retrievalResult.executionId,
        executionTimeMs: retrievalResult.retrievalLatencyMs + retrievalResult.rankingLatencyMs,
        gatewayLatencyMs: 0,
        providerKey: "knowledge",
        model: "retrieval-engine",
        promptVersionId: null,
        promptBuildId: null,
        promptTemplateKey: null,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: retrievalResult.totalTokens,
          totalTokens: retrievalResult.totalTokens,
        },
        estimatedCostUsd: null,
        knowledgeUsed: true,
        knowledgeChunkCount: retrievalResult.chunkCount,
        streaming: false,
        outputMode: preparedConfig.outputMode,
        cacheHit: false,
        status: "success",
      },
      retrievalResult,
      output,
      preparedConfig,
    );

    const outputVariable = preparedConfig.outputVariable ?? `ai_${preparedConfig.nodeKey}`;

    this.record({
      type: "node_completed",
      nodeKey: preparedConfig.nodeKey,
      workflowId: context.flow.id,
      executionId: retrievalResult.executionId,
      companyId: context.company.id,
      latencyMs: retrievalResult.retrievalLatencyMs,
      knowledgeUsed: true,
      metadata: {
        documentsRetrieved: metadata.knowledgeDocumentsRetrieved ?? 0,
        chunksRetrieved: retrievalResult.chunkCount,
      },
    });

    return {
      outcome: "continue",
      variables: {
        ...context.variables,
        [outputVariable]: output,
        __aiLastExecution: metadata,
      },
      output: {
        aiNodeKey: preparedConfig.nodeKey,
        outputVariable,
        result: output,
        metadata,
      },
    };
  }

  private buildExecutionRequest(
    context: AIWorkflowAutomationContext,
    config: AIWorkflowNodeConfig,
    nodeImpl?: BaseAIWorkflowNode,
  ) {
    const knowledge = config.knowledge;
    const promptContext = nodeImpl?.buildPromptContext(config, context) ?? {};
    const question =
      knowledge?.queryTemplate?.trim() ||
      String(
        (promptContext.extract as { input?: string } | undefined)?.input ??
          (promptContext.decision as { input?: string } | undefined)?.input ??
          (promptContext.summary as { input?: string } | undefined)?.input ??
          (promptContext.knowledgeSearch as { query?: string } | undefined)?.query ??
          context.variables.__lastUserMessage ??
          context.input?.message ??
          context.variables.input ??
          "",
      ).trim();

    return {
      companyId: context.company.id,
      workflowId: context.flow.id,
      executionId: context.run.id,
      // prompt_builds.conversation_id FKs to public.conversations — never pass automation session ids.
      conversationId: resolveChannelConversationId(context),
      correlationId: context.run.id,
      templateKey: config.promptTemplateKey ?? config.nodeKey,
      templateType: config.promptTemplateType ?? "workflow",
      providerConnectionId: config.providerConnectionId,
      providerKey: config.providerKey,
      model: config.model,
      workflowVariables: {
        ...context.variables,
        ...promptContext,
      },
      workflowInput: context.input,
      knowledgeQuery:
        knowledge?.enabled && question
          ? {
              question,
              collectionId: knowledge.collectionId,
              embeddingConnectionId: knowledge.embeddingConnectionId,
              vectorStoreConnectionId: knowledge.vectorStoreConnectionId,
              maxChunks: knowledge.maxChunks,
              similarityThreshold: knowledge.similarityThreshold,
            }
          : undefined,
      policy: {
        temperature: config.policies?.temperature,
        topP: config.policies?.topP,
        maxTokens: config.policies?.maxTokens,
        streaming: config.policies?.streaming,
        timeoutMs: config.policies?.timeoutMs,
        retryCount: config.policies?.retryCount,
        responseFormat: config.policies?.responseFormat,
      },
      contextPolicyOverrides: {
        includeWorkflowVariables: true,
        includeKnowledge: knowledge?.enabled === true,
      },
      stream: config.policies?.streaming,
    };
  }

  private record(event: Parameters<AIWorkflowObservability["record"]>[0]): void {
    this.deps.observability?.record(event);
  }
}

function resolveChannelConversationId(context: AIWorkflowAutomationContext): string | null {
  const fromVariables = context.variables.conversationId;
  if (typeof fromVariables === "string" && fromVariables.trim()) {
    return fromVariables.trim();
  }
  return null;
}

function readUnknownErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function isAIWorkflowActionConfig(config: Record<string, unknown>): boolean {
  return isAIWorkflowEngineConfig(config);
}

export function normalizeAIWorkflowActionConfig(
  config: Record<string, unknown>,
): AIWorkflowNodeConfig {
  const resolved = fromAIWorkflowEngineConfig(config);
  if (!resolved) {
    throw new Error("Node is not configured as an AI workflow action.");
  }
  return normalizeAIWorkflowNodeConfig(resolved as unknown as Record<string, unknown>, resolved.nodeKey);
}
