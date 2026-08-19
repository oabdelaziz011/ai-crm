import type { AIProviderFactory } from "@workspace/ai-provider-layer";
import { AI_EXECUTION_PERMISSIONS } from "../constants.js";
import {
  AICommercialDeniedError,
  AIExecutionCancelledError,
  AIExecutionTimeoutError,
  PermissionDeniedError,
  PromptBuildNotFoundError,
  ProviderConnectionDisabledError,
  ProviderConnectionNotFoundError,
} from "../errors.js";
import type { AiTokensCommercialPort } from "../ports/ai-tokens-commercial-port.js";
import type {
  AIExecutionMetricsRepository,
  AIExecutionRepository,
  PromptBuildReader,
  ProviderConnectionReader,
} from "../repositories/execution-repositories.js";
import type { AIExecutionPolicyService } from "./ai-execution-policy-service.js";
import type {
  AIExecutionResult,
  ExecuteAIInput,
  NormalizedAIResponse,
  ProviderConnectionSnapshot,
  ServiceContext,
} from "../types.js";
import {
  assertNotCancelled,
  isProviderReportedTokenUsage,
  normalizeProviderResponse,
  resolveModel,
  sleep,
  withTimeout,
} from "../utils/execution-utils.js";

const EMPTY_TOKEN_USAGE = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
} as const;

function assertPermission(ctx: ServiceContext, permission: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.hasPermission(permission)) {
    throw new PermissionDeniedError(permission);
  }
}

function assertCompanyAccess(ctx: ServiceContext, companyId: string): void {
  if (ctx.isSuperAdmin) return;
  if (!ctx.companyId || ctx.companyId !== companyId) {
    throw new PermissionDeniedError(AI_EXECUTION_PERMISSIONS.manage);
  }
}

export class AIExecutionService {
  constructor(
    private readonly executionRepository: AIExecutionRepository,
    private readonly metricsRepository: AIExecutionMetricsRepository,
    private readonly promptBuildReader: PromptBuildReader,
    private readonly connectionReader: ProviderConnectionReader,
    private readonly providerFactory: AIProviderFactory,
    private readonly policyService: AIExecutionPolicyService,
    private readonly aiTokensCommercial?: AiTokensCommercialPort,
  ) {}

  async execute(ctx: ServiceContext, input: ExecuteAIInput): Promise<AIExecutionResult> {
    assertPermission(ctx, AI_EXECUTION_PERMISSIONS.manage);
    assertCompanyAccess(ctx, input.companyId);
    assertNotCancelled(input.abortSignal);

    const promptBuild = await this.promptBuildReader.findById(input.promptBuildId);
    if (!promptBuild || promptBuild.company_id !== input.companyId) {
      throw new PromptBuildNotFoundError(input.promptBuildId);
    }

    const primaryConnection = await this.resolveConnection(input.companyId, input.providerConnectionId);
    if (!primaryConnection.is_enabled) {
      throw new ProviderConnectionDisabledError(primaryConnection.id);
    }

    const policy = this.policyService.resolvePolicy(primaryConnection, input.policy);
    const model = resolveModel(primaryConnection.configuration, input.model);

    const execution = await this.executionRepository.create({
      companyId: input.companyId,
      conversationId: input.conversationId ?? promptBuild.conversation_id,
      promptBuildId: promptBuild.id,
      providerConnectionId: primaryConnection.id,
      fallbackConnectionId: policy.fallback_connection_id,
      providerKey: primaryConnection.provider_key,
      model,
      runtimePolicy: policy,
      createdBy: ctx.userId,
    });

    await this.executionRepository.markRunning(execution.id);
    const startedAt = Date.now();

    try {
      if (this.aiTokensCommercial) {
        const access = await this.aiTokensCommercial.checkAccess({ companyId: input.companyId });
        if (!access.allowed) {
          throw new AICommercialDeniedError(access.reason);
        }
      }

      const result = await this.runWithRetries(
        primaryConnection,
        promptBuild.final_prompt,
        model,
        policy,
        promptBuild,
        execution.id,
        input.abortSignal,
        input.onStreamChunk,
      );

      const completed = await this.executionRepository.complete({
        executionId: execution.id,
        status: result.usedFallback ? "fallback" : "succeeded",
        finishReason: result.finishReason,
        rawResponse: result.raw,
        normalizedResponse: result.normalized as unknown as Record<string, unknown>,
        tokenUsage: result.tokenUsage,
        retryCount: result.retryCount,
        usedFallbackProvider: result.usedFallback,
        durationMs: Date.now() - startedAt,
        fallbackConnectionId: result.fallbackConnectionId,
        providerKey: result.providerKey,
        model: result.model,
      });

      await this.recordMetrics(input.companyId, completed);

      if (this.aiTokensCommercial && isProviderReportedTokenUsage(result.tokenUsage)) {
        await this.aiTokensCommercial
          .recordUsage({
            companyId: input.companyId,
            executionId: execution.id,
            quantity: result.tokenUsage.total_tokens,
          })
          .catch(() => undefined);
      }

      return this.toResult(completed, result.normalized);
    } catch (error) {
      return this.failExecution(
        execution.id,
        input.companyId,
        startedAt,
        error,
        primaryConnection.provider_key,
        model,
      );
    }
  }

  private async runWithRetries(
    connection: ProviderConnectionSnapshot,
    prompt: string,
    model: string,
    policy: ReturnType<AIExecutionPolicyService["resolvePolicy"]>,
    promptBuild: NonNullable<Awaited<ReturnType<PromptBuildReader["findById"]>>>,
    executionId: string,
    abortSignal?: AbortSignal | null,
    onStreamChunk?: (chunk: string) => void,
  ) {
    let retryCount = 0;
    const maxAttempts = Math.max(1, policy.retry_count + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      assertNotCancelled(abortSignal);
      try {
        return await this.invokeProvider(
          connection,
          prompt,
          model,
          policy,
          promptBuild,
          false,
          retryCount,
          onStreamChunk,
        );
      } catch (error) {
        lastError = error;
        if (error instanceof AIExecutionCancelledError || error instanceof AIExecutionTimeoutError) {
          throw error;
        }
        if (attempt < maxAttempts) {
          retryCount += 1;
          await this.executionRepository.updateRetryCount(executionId, retryCount);
          await sleep(policy.retry_delay_ms);
          continue;
        }
      }
    }

    if (policy.fallback_connection_id && policy.fallback_connection_id !== connection.id) {
      const fallbackConnection = await this.connectionReader.findById(policy.fallback_connection_id);
      if (fallbackConnection?.is_enabled) {
        const fallbackModel = resolveModel(fallbackConnection.configuration, model);
        return {
          ...(await this.invokeProvider(
            fallbackConnection,
            prompt,
            fallbackModel,
            policy,
            promptBuild,
            true,
            retryCount,
            onStreamChunk,
          )),
          fallbackConnectionId: fallbackConnection.id,
        };
      }
    }

    throw lastError instanceof Error ? lastError : new Error("AI execution failed.");
  }

  private async invokeProvider(
    connection: ProviderConnectionSnapshot,
    prompt: string,
    model: string,
    policy: ReturnType<AIExecutionPolicyService["resolvePolicy"]>,
    promptBuild: NonNullable<Awaited<ReturnType<PromptBuildReader["findById"]>>>,
    usedFallback: boolean,
    retryCount: number,
    onStreamChunk?: (chunk: string) => void,
  ) {
    const provider = await this.providerFactory.resolve({
      providerKey: connection.provider_key,
      configuration: connection.configuration,
    });

    const streamingEnabled = policy.streaming || Boolean(onStreamChunk);

    const generateResult = await withTimeout(
      provider.generate({
        prompt,
        model,
        metadata: {
          temperature: policy.temperature,
          top_p: policy.top_p,
          presence_penalty: policy.presence_penalty,
          frequency_penalty: policy.frequency_penalty,
          max_tokens: policy.max_tokens,
          response_format: policy.response_format,
          streaming: streamingEnabled,
          onChunk: onStreamChunk,
        },
      }),
      policy.timeout_ms,
      () => new AIExecutionTimeoutError(policy.timeout_ms),
    );

    const normalized = normalizeProviderResponse(
      connection.provider_key,
      generateResult,
      promptBuild,
      policy,
    );
    const tokenUsage = generateResult.tokenUsage ?? EMPTY_TOKEN_USAGE;
    const finishReason = generateResult.finishReason ?? normalized.finishReason;

    return {
      raw: normalized.raw,
      normalized: {
        ...normalized.normalized,
        finish_reason: finishReason,
      },
      finishReason,
      tokenUsage,
      usedFallback,
      retryCount,
      fallbackConnectionId: null as string | null,
      providerKey: connection.provider_key,
      model,
    };
  }

  private async failExecution(
    executionId: string,
    companyId: string,
    startedAt: number,
    error: unknown,
    providerKey: string,
    model: string,
  ): Promise<AIExecutionResult> {
    const isTimeout = error instanceof AIExecutionTimeoutError;
    const isCancelled =
      error instanceof AIExecutionCancelledError ||
      (error instanceof Error && error.message === "AI_EXECUTION_CANCELLED");

    const status = isCancelled ? "cancelled" : isTimeout ? "timeout" : "failed";
    const errorCode =
      error instanceof Error && "code" in error
        ? String((error as { code?: string }).code ?? "AI_EXECUTION_FAILED")
        : isTimeout
          ? "AI_EXECUTION_TIMEOUT"
          : isCancelled
            ? "AI_EXECUTION_CANCELLED"
            : "AI_EXECUTION_FAILED";
    const errorMessage = error instanceof Error ? error.message : "AI execution failed.";

    const completed = await this.executionRepository.complete({
      executionId,
      status,
      tokenUsage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      errorCode,
      errorMessage,
      retryCount: 0,
      usedFallbackProvider: false,
      durationMs: Date.now() - startedAt,
    });

    await this.recordMetrics(companyId, completed);

    return {
      execution_id: completed.id,
      provider_key: providerKey,
      model,
      status: completed.status,
      latency_ms: completed.duration_ms ?? Date.now() - startedAt,
      token_usage: completed.token_usage,
      finish_reason: null,
      raw_response: null,
      normalized_response: null,
      error_code: completed.error_code,
      error_message: completed.error_message,
      used_fallback_provider: false,
      retry_count: completed.retry_count,
    };
  }

  private async recordMetrics(companyId: string, execution: Awaited<ReturnType<AIExecutionRepository["complete"]>>) {
    await this.metricsRepository.create({
      companyId,
      executionId: execution.id,
      providerKey: execution.provider_key,
      model: execution.model,
      status: execution.status,
      latencyMs: execution.duration_ms ?? 0,
      tokenUsage: execution.token_usage,
      retryCount: execution.retry_count,
      usedFallbackProvider: execution.used_fallback_provider,
    });
  }

  private toResult(
    execution: Awaited<ReturnType<AIExecutionRepository["complete"]>>,
    normalized: NormalizedAIResponse,
  ): AIExecutionResult {
    return {
      execution_id: execution.id,
      provider_key: execution.provider_key,
      model: execution.model,
      status: execution.status,
      latency_ms: execution.duration_ms ?? 0,
      token_usage: execution.token_usage,
      finish_reason: execution.finish_reason,
      raw_response: execution.raw_response,
      normalized_response: normalized,
      error_code: execution.error_code,
      error_message: execution.error_message,
      used_fallback_provider: execution.used_fallback_provider,
      retry_count: execution.retry_count,
    };
  }

  private async resolveConnection(companyId: string, connectionId?: string | null) {
    if (connectionId) {
      const connection = await this.connectionReader.findById(connectionId);
      if (!connection || connection.company_id !== companyId) {
        throw new ProviderConnectionNotFoundError(connectionId);
      }
      return connection;
    }

    const defaultConnection = await this.connectionReader.findDefault(companyId);
    if (!defaultConnection) {
      throw new ProviderConnectionNotFoundError();
    }
    return defaultConnection;
  }
}
