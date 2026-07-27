import { createRuntimeId, hashRuntimePayload } from "../utils/runtime-crypto.js";
import { AI_EXECUTION_PERMISSIONS } from "../constants.js";
import { ContextBuilder } from "../context/context-builder.js";
import { ConversationWindowManager } from "../context/conversation-window-manager.js";
import { TokenBudgetManager } from "../context/token-budget-manager.js";
import {
  GatewayTimeoutError,
  PolicyViolationError,
  PromptRenderError,
  ProviderUnavailableError,
} from "../errors/runtime-errors.js";
import { PermissionDeniedError, ProviderConnectionDisabledError, ProviderConnectionNotFoundError } from "../errors.js";
import type { RuntimeGatewayPort, RuntimePromptPort, RuntimeToolPort, PlatformRuntimeConfigPort } from "../ports/runtime-ports.js";
import type { RuntimeKnowledgePort } from "../ports/knowledge-port.js";
import { mapKnowledgeQueryResult } from "../ports/knowledge-port.js";
import type {
  AIExecutionMetricsRepository,
  AIExecutionRepository,
  PromptBuildReader,
  ProviderConnectionReader,
} from "../repositories/execution-repositories.js";
import type { RuntimeRegistryBundle } from "../registries/runtime-registries.js";
import { RuntimeObservability } from "../observability/runtime-observability.js";
import { ExecutionSessionService } from "./execution-session-service.js";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import { StreamingRuntimeService } from "./streaming-runtime-service.js";
import type { AIExecutionPolicyService } from "../services/ai-execution-policy-service.js";
import type {
  EnterpriseRuntimeExecuteInput,
  EnterpriseRuntimeExecuteResult,
  ServiceContext,
} from "../types.js";
import { resolveModel } from "../utils/execution-utils.js";
import { resolveGatewayMessages } from "../utils/build-gateway-messages.js";
import { normalizeConversationResponse } from "../utils/normalize-conversation-response.js";
import { logOpenAIRequest } from "../utils/log-openai-request.js";
import { createAIRuntimeLogEvent, logAIRuntimeEvent } from "../utils/ai-runtime-logger.js";

export class EnterpriseAIRuntimeService {
  private readonly contextBuilder: ContextBuilder;
  private readonly conversationWindow = new ConversationWindowManager();
  private readonly tokenBudget = new TokenBudgetManager();
  private readonly streaming = new StreamingRuntimeService();
  private readonly toolLoop: ToolCallLoopService;

  constructor(
    private readonly deps: {
      prompt: RuntimePromptPort;
      gateway: RuntimeGatewayPort;
      tools?: RuntimeToolPort;
      registries: RuntimeRegistryBundle;
      executionRepository: AIExecutionRepository;
      metricsRepository: AIExecutionMetricsRepository;
      connectionReader: ProviderConnectionReader;
      promptBuildReader: PromptBuildReader;
      policyService: AIExecutionPolicyService;
      sessions: ExecutionSessionService;
      observability: RuntimeObservability;
      knowledge?: RuntimeKnowledgePort;
      platformConfig?: PlatformRuntimeConfigPort;
    },
  ) {
    this.contextBuilder = new ContextBuilder(deps.registries.contextProviders);
    this.toolLoop = new ToolCallLoopService({ gateway: deps.gateway, tools: deps.tools });
  }

  async buildPrompt(ctx: ServiceContext, input: EnterpriseRuntimeExecuteInput) {
    this.assertAccess(ctx, input.companyId);
    const contextPolicy = this.deps.registries.contextPolicies.resolve(
      input.contextPolicyKey,
      input.contextPolicyOverrides,
    );
    const window = this.conversationWindow.trim(input.recentMessages ?? [], input.conversationWindow);
    const knowledge = await this.resolveKnowledgeContext(ctx, input);
    const contextBuilt = this.contextBuilder.build(
      {
        ...input.promptContext,
        companyId: input.companyId,
        conversationId: input.conversationId,
        workflowId: input.workflowId,
        recentMessages: window.messages,
        knowledge,
      },
      this.deps.registries.contextPolicies.enabledProviders(contextPolicy),
    );
    const promptResult = await this.deps.prompt.execute(ctx, {
      companyId: input.companyId,
      conversationId: input.conversationId,
      templateKey: input.templateKey,
      templateType: input.templateType,
      mode: input.orchestrationMode,
      currentUserMessage: input.currentUserMessage,
      toolsEnabled: input.toolsEnabled,
      workflowId: input.workflowId ?? undefined,
      context: contextBuilt.context,
    });
    return {
      ...promptResult.builtPrompt,
      contextSizeBytes: contextBuilt.sizeBytes,
      trimmedMessageCount: window.trimmedCount,
    };
  }

  async execute(ctx: ServiceContext, input: EnterpriseRuntimeExecuteInput): Promise<EnterpriseRuntimeExecuteResult> {
    this.assertAccess(ctx, input.companyId);
    const executionId = input.executionId ?? createRuntimeId();
    const sessionId = input.sessionId ?? createRuntimeId();
    const started = Date.now();

    logAIRuntimeEvent(
      createAIRuntimeLogEvent("ai_runtime_request_started", {
        correlationId: input.correlationId ?? undefined,
        companyId: input.companyId,
        conversationId: input.conversationId ?? undefined,
        executionId,
        sessionId,
        streaming: Boolean(input.stream),
      }),
    );

    await this.deps.registries.hooks.emit("beforeContextBuild", { input });

    const contextPolicy = this.deps.registries.contextPolicies.resolve(
      input.contextPolicyKey,
      input.contextPolicyOverrides,
    );
    const enabledProviders = this.deps.registries.contextPolicies.enabledProviders(contextPolicy);

    const window = this.conversationWindow.trim(input.recentMessages ?? [], input.conversationWindow);
    const knowledge = await this.resolveKnowledgeContext(ctx, input);
    const contextBuilt = this.contextBuilder.build(
      {
        ...input.promptContext,
        companyId: input.companyId,
        conversationId: input.conversationId,
        workflowId: input.workflowId,
        executionId,
        sessionId,
        correlationId: input.correlationId ?? undefined,
        recentMessages: window.messages,
        knowledge,
      },
      enabledProviders,
    );

    await this.deps.registries.hooks.emit("afterContextBuild", { input });

    await this.deps.registries.middleware.createPipeline().run({ input });

    await this.deps.registries.hooks.emit("beforePromptRender", { input });

    let builtPrompt: {
      buildId: string | null;
      templateKey: string;
      templateVersionId: string;
      finalPrompt: string;
      gatewayMessages: Array<{ role: "system" | "developer" | "user" | "assistant"; content: string }>;
      outputContract?: { format: "text" | "json"; instructions?: string };
      orchestrationMode?: "conversation" | "execution";
      metadata?: { renderedSize: number; variableCount: number; estimatedTokens: number; executionTimeMs: number };
    };

    if (input.promptBuildId) {
      const existing = await this.deps.promptBuildReader.findById(input.promptBuildId);
      if (!existing || existing.company_id !== input.companyId) {
        throw new PromptRenderError(`Prompt build ${input.promptBuildId} not found.`);
      }
      builtPrompt = {
        buildId: existing.id,
        templateKey: "loaded_build",
        templateVersionId: existing.id,
        finalPrompt: existing.final_prompt,
        gatewayMessages: resolveGatewayMessages({
          gatewayMessages: existing.gateway_messages,
          finalPrompt: existing.final_prompt,
        }),
        outputContract: existing.output_contract,
        orchestrationMode: existing.message_plan?.mode ?? "conversation",
        metadata: {
          renderedSize: existing.final_prompt.length,
          variableCount: 0,
          estimatedTokens: Math.ceil(existing.final_prompt.length / 4),
          executionTimeMs: 0,
        },
      };
    } else {
      const rendered = await this.buildPrompt(ctx, input);
      builtPrompt = {
        buildId: rendered.buildId,
        templateKey: rendered.templateKey,
        templateVersionId: rendered.templateVersionId,
        finalPrompt: rendered.finalPrompt,
        gatewayMessages: resolveGatewayMessages({
          gatewayMessages: rendered.gatewayMessages,
          finalPrompt: rendered.finalPrompt,
        }),
        outputContract: rendered.messagePlan?.outputContract,
        orchestrationMode: rendered.messagePlan?.mode ?? input.orchestrationMode ?? "conversation",
        metadata: rendered.metadata,
      };
    }
    if (builtPrompt.gatewayMessages.length === 0) {
      throw new PromptRenderError("Prompt runtime returned empty gateway messages.");
    }

    this.tokenBudget.assertWithinBudget(
      builtPrompt.metadata?.estimatedTokens ?? Math.ceil(builtPrompt.finalPrompt.length / 4),
      input.tokenBudget,
    );

    await this.deps.registries.hooks.emit("afterPromptRender", { input });

    const connection = await this.resolveConnection(input.companyId, input.providerConnectionId);
    if (!connection.is_enabled) throw new ProviderConnectionDisabledError(connection.id);

    const runtimePolicy = this.deps.policyService.resolvePolicy(connection, input.policy);

    const gatewayMessages = builtPrompt.gatewayMessages;
    const responseFormat =
      builtPrompt.orchestrationMode === "execution" &&
      (builtPrompt.outputContract?.format ?? runtimePolicy.response_format) === "json"
        ? "json"
        : "text";

    const llmTools = this.deps.tools?.listLlmTools() ?? [];
    const useToolLoop = Boolean(
      this.deps.tools && input.conversationId && llmTools.length > 0,
    );

    const useCase = useToolLoop ? "tool_calling" : "chat";
    const platformConfiguration =
      connection.uses_platform_key !== false && this.deps.platformConfig
        ? await this.deps.platformConfig.resolve({
            companyId: input.companyId,
            providerKey: input.providerKey ?? connection.provider_key,
            useCase,
          })
        : {};

    const mergedConnectionConfiguration = {
      ...connection.configuration,
      ...platformConfiguration,
      ...(typeof platformConfiguration.model === "string" && platformConfiguration.model
        ? { model: platformConfiguration.model }
        : {}),
    };

    const model = resolveModel(mergedConnectionConfiguration, input.model);
    const providerKey = input.providerKey ?? connection.provider_key;

    logOpenAIRequest({
      correlationId: input.correlationId ?? undefined,
      companyId: input.companyId,
      conversationId: input.conversationId ?? undefined,
      executionId,
      sessionId,
      providerKey,
      model,
      promptBuildId: builtPrompt.buildId,
      responseFormat,
      request: {
        messages: gatewayMessages,
        providerKey,
        model,
        temperature: runtimePolicy.temperature,
        maxTokens: runtimePolicy.max_tokens,
        topP: runtimePolicy.top_p,
        context: {
          companyId: input.companyId,
          workflowId: input.workflowId ?? undefined,
          executionId,
          conversationId: input.conversationId ?? undefined,
          userId: ctx.userId,
        },
        metadata: {
          ...mergedConnectionConfiguration,
          companyId: input.companyId,
          conversationId: input.conversationId ?? undefined,
          executionId,
          correlationId: input.correlationId,
          response_format: responseFormat,
        },
        tools: useToolLoop ? llmTools : undefined,
      },
    });

    if (runtimePolicy.fallback_connection_id && !providerKey) {
      throw new PolicyViolationError("Provider key is required by runtime policy.");
    }

    const cacheKey = this.deps.registries.cache.buildKey({
      promptVersionId: builtPrompt.templateVersionId,
      variablesHash: hashRuntimePayload(JSON.stringify(contextBuilt.context)),
      contextHash: hashRuntimePayload(String(contextBuilt.sizeBytes)),
      providerKey,
      model,
    });

    if (input.cacheEnabled !== false) {
      const cached = this.deps.registries.cache.get<EnterpriseRuntimeExecuteResult>("execution", cacheKey);
      if (cached) {
        this.deps.observability.recordCacheHit();
        this.deps.observability.record({
          type: "cache_hit",
          executionId: cached.executionId,
          sessionId: cached.sessionId,
          metrics: { latencyMs: 0 },
        });
        return { ...cached, cacheHit: true };
      }
      this.deps.observability.recordCacheMiss();
    }

    await this.deps.registries.hooks.emit("beforeGateway", { input });

    const gatewayStarted = Date.now();
    let responseText = "";
    let gatewayLatencyMs = 0;
    let tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let estimatedCostUsd: number | null = null;
    let finishReason = "stop";

    const gatewayMetadata = {
      ...mergedConnectionConfiguration,
      companyId: input.companyId,
      conversationId: input.conversationId ?? undefined,
      executionId,
      correlationId: input.correlationId,
      response_format: responseFormat,
      chatMessages: gatewayMessages,
    };

    const gatewayBaseRequest = {
      messages: gatewayMessages,
      providerKey,
      model,
      temperature: runtimePolicy.temperature,
      maxTokens: runtimePolicy.max_tokens,
      topP: runtimePolicy.top_p,
      context: {
        companyId: input.companyId,
        workflowId: input.workflowId ?? undefined,
        executionId,
        conversationId: input.conversationId ?? undefined,
        userId: ctx.userId,
      },
      metadata: gatewayMetadata,
      tools: useToolLoop ? llmTools : undefined,
    };

    if (useToolLoop) {
      const loopResult = await this.toolLoop.runWithOptionalStreaming({
        ctx,
        conversationId: input.conversationId!,
        gatewayRequest: gatewayBaseRequest,
        tools: llmTools,
        allowedToolKeys: this.deps.tools!.allowedToolKeys(),
        onStreamChunk: input.stream ? input.onStreamChunk : undefined,
      });
      gatewayLatencyMs = Date.now() - gatewayStarted;
      responseText = loopResult.response.text;
      finishReason = loopResult.response.finishReason;
      tokenUsage = {
        prompt_tokens: loopResult.response.usage.inputTokens,
        completion_tokens: loopResult.response.usage.outputTokens,
        total_tokens: loopResult.response.usage.totalTokens,
      };
      estimatedCostUsd = loopResult.response.estimatedCostUsd ?? null;
    } else if (input.stream && this.deps.gateway.streamChatCompletion) {
      for await (const event of this.streaming.stream(
        executionId,
        this.deps.gateway,
        gatewayBaseRequest,
        (streamEvent) => {
          if (streamEvent.type === "delta") input.onStreamChunk?.(streamEvent.text);
        },
      )) {
        if (event.type === "done") responseText = event.text;
      }
      gatewayLatencyMs = Date.now() - gatewayStarted;
      tokenUsage = {
        prompt_tokens: builtPrompt.metadata?.estimatedTokens ?? 0,
        completion_tokens: Math.ceil(responseText.length / 4),
        total_tokens:
          (builtPrompt.metadata?.estimatedTokens ?? 0) + Math.ceil(responseText.length / 4),
      };
    } else {
      const gatewayResponse = await this.deps.gateway.chatCompletion(gatewayBaseRequest);
      gatewayLatencyMs = gatewayResponse.latencyMs;
      responseText = gatewayResponse.text;
      finishReason = gatewayResponse.finishReason;
      tokenUsage = {
        prompt_tokens: gatewayResponse.usage.inputTokens,
        completion_tokens: gatewayResponse.usage.outputTokens,
        total_tokens: gatewayResponse.usage.totalTokens,
      };
      estimatedCostUsd = gatewayResponse.estimatedCostUsd ?? null;
    }

    if (!responseText.trim()) {
      throw new ProviderUnavailableError(providerKey);
    }

    logAIRuntimeEvent(
      createAIRuntimeLogEvent("ai_runtime_model_response_received", {
        correlationId: input.correlationId ?? undefined,
        companyId: input.companyId,
        conversationId: input.conversationId ?? undefined,
        executionId,
        sessionId,
        providerKey,
        model,
        promptBuildId: builtPrompt.buildId,
        rawModelResponse: responseText,
        streaming: Boolean(input.stream),
      }),
    );

    const normalizedResponseText = normalizeConversationResponse(
      responseText,
      builtPrompt.outputContract ?? { format: responseFormat },
    );

    responseText = normalizedResponseText;

    if (!responseText.trim()) {
      throw new ProviderUnavailableError(providerKey);
    }

    await this.deps.registries.hooks.emit("afterGateway", { input });

    const latencyMs = Date.now() - started;
    const execution = await this.deps.executionRepository.create({
      companyId: input.companyId,
      conversationId: input.conversationId ?? null,
      promptBuildId: builtPrompt.buildId ?? executionId,
      providerConnectionId: connection.id,
      fallbackConnectionId: runtimePolicy.fallback_connection_id,
      providerKey,
      model,
      runtimePolicy,
      createdBy: ctx.userId,
    });
    await this.deps.executionRepository.markRunning(execution.id);
    await this.deps.executionRepository.complete({
      executionId: execution.id,
      status: "succeeded",
      finishReason,
      rawResponse: { text: responseText },
      normalizedResponse: { content: responseText, format: responseFormat },
      tokenUsage,
      retryCount: 0,
      usedFallbackProvider: false,
      durationMs: latencyMs,
      providerKey,
      model,
    });

    await this.deps.metricsRepository.create({
      companyId: input.companyId,
      executionId: execution.id,
      providerKey,
      model,
      status: "succeeded",
      latencyMs,
      tokenUsage,
      retryCount: 0,
      usedFallbackProvider: false,
    });

    const session = this.deps.sessions.create({
      executionId: execution.id,
      workflowId: input.workflowId ?? null,
      conversationId: input.conversationId ?? null,
      promptVersionId: builtPrompt.templateVersionId,
      providerKey,
      model,
      latencyMs,
      tokenUsage,
      estimatedCostUsd,
      status: "succeeded",
    });

    this.deps.observability.record({
      type: "gateway_completed",
      executionId: execution.id,
      sessionId: session.sessionId,
      metrics: {
        latencyMs,
        gatewayLatencyMs,
        contextSizeBytes: contextBuilt.sizeBytes,
        promptSizeBytes: builtPrompt.finalPrompt.length,
        totalTokens: tokenUsage.total_tokens,
      },
    });

    logAIRuntimeEvent(
      createAIRuntimeLogEvent("ai_runtime_execution_completed", {
        correlationId: input.correlationId ?? undefined,
        companyId: input.companyId,
        conversationId: input.conversationId ?? undefined,
        executionId: execution.id,
        sessionId: session.sessionId,
        providerKey,
        model,
        promptBuildId: builtPrompt.buildId,
        normalizedResponse: responseText,
        inputTokens: tokenUsage.prompt_tokens,
        outputTokens: tokenUsage.completion_tokens,
        totalTokens: tokenUsage.total_tokens,
        latencyMs,
        gatewayLatencyMs,
        streaming: Boolean(input.stream),
        cacheHit: false,
      }),
    );

    const result: EnterpriseRuntimeExecuteResult = {
      executionId: execution.id,
      sessionId: session.sessionId,
      promptBuildId: builtPrompt.buildId,
      promptVersionId: builtPrompt.templateVersionId,
      templateKey: builtPrompt.templateKey,
      providerKey,
      model,
      status: "succeeded",
      latencyMs,
      contextSizeBytes: contextBuilt.sizeBytes,
      promptSizeBytes: builtPrompt.finalPrompt.length,
      gatewayLatencyMs,
      tokenUsage,
      estimatedCostUsd,
      responseText,
      cacheHit: false,
      trimmedMessageCount: window.trimmedCount,
    };

    if (input.cacheEnabled !== false) {
      this.deps.registries.cache.set("execution", cacheKey, result, 60_000);
    }

    return result;
  }

  listSessions() {
    return this.deps.sessions.list();
  }

  getObservability() {
    return this.deps.observability;
  }

  private async resolveKnowledgeContext(ctx: ServiceContext, input: EnterpriseRuntimeExecuteInput) {
    if (input.promptContext.knowledge) return input.promptContext.knowledge;
    if (!input.knowledgeQuery || !this.deps.knowledge) return undefined;
    const result = await this.deps.knowledge.retrieve(ctx, input.knowledgeQuery);
    return mapKnowledgeQueryResult(result);
  }

  private assertAccess(ctx: ServiceContext, companyId: string) {
    if (ctx.isSuperAdmin) return;
    if (!ctx.hasPermission(AI_EXECUTION_PERMISSIONS.manage)) {
      throw new PermissionDeniedError(AI_EXECUTION_PERMISSIONS.manage);
    }
    if (!ctx.companyId || ctx.companyId !== companyId) {
      throw new PermissionDeniedError(AI_EXECUTION_PERMISSIONS.manage);
    }
  }

  private async resolveConnection(companyId: string, connectionId?: string | null) {
    if (connectionId) {
      const connection = await this.deps.connectionReader.findById(connectionId);
      if (!connection || connection.company_id !== companyId) {
        throw new ProviderConnectionNotFoundError(connectionId);
      }
      return connection;
    }
    const defaultConnection = await this.deps.connectionReader.findDefault(companyId);
    if (!defaultConnection) throw new ProviderConnectionNotFoundError();
    return defaultConnection;
  }
}
