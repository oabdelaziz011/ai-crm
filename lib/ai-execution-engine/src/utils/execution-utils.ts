import type { GenerateResult } from "@workspace/ai-provider-layer";
import { DEFAULT_EXECUTION_POLICY } from "../constants.js";
import { AIExecutionCancelledError, ValidationError } from "../errors.js";
import type { ExecutionPolicyOverrides, ExecutionRuntimePolicy, NormalizedAIResponse, PromptBuildSnapshot, TokenUsage } from "../types.js";
import type { ResponseFormat } from "../constants.js";

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function mergeExecutionPolicy(
  connectionConfiguration: Record<string, unknown>,
  overrides?: ExecutionPolicyOverrides,
): ExecutionRuntimePolicy {
  const connectionPolicy =
    typeof connectionConfiguration.execution_policy === "object" &&
    connectionConfiguration.execution_policy !== null
      ? (connectionConfiguration.execution_policy as ExecutionPolicyOverrides)
      : {};

  const fallbackFromConnection =
    typeof connectionConfiguration.fallback_connection_id === "string"
      ? connectionConfiguration.fallback_connection_id
      : null;

  return {
    temperature: pickNumber(overrides?.temperature, connectionPolicy.temperature, DEFAULT_EXECUTION_POLICY.temperature),
    top_p: pickNumber(overrides?.top_p, connectionPolicy.top_p, DEFAULT_EXECUTION_POLICY.top_p),
    presence_penalty: pickNumber(
      overrides?.presence_penalty,
      connectionPolicy.presence_penalty,
      DEFAULT_EXECUTION_POLICY.presence_penalty,
    ),
    frequency_penalty: pickNumber(
      overrides?.frequency_penalty,
      connectionPolicy.frequency_penalty,
      DEFAULT_EXECUTION_POLICY.frequency_penalty,
    ),
    max_tokens: pickNumber(overrides?.max_tokens, connectionPolicy.max_tokens, DEFAULT_EXECUTION_POLICY.max_tokens),
    response_format: pickResponseFormat(
      overrides?.response_format,
      connectionPolicy.response_format,
      DEFAULT_EXECUTION_POLICY.response_format,
    ),
    streaming: pickBoolean(overrides?.streaming, connectionPolicy.streaming, DEFAULT_EXECUTION_POLICY.streaming),
    timeout_ms: pickNumber(overrides?.timeout_ms, connectionPolicy.timeout_ms, DEFAULT_EXECUTION_POLICY.timeout_ms),
    retry_count: pickNumber(overrides?.retry_count, connectionPolicy.retry_count, DEFAULT_EXECUTION_POLICY.retry_count),
    retry_delay_ms: pickNumber(
      overrides?.retry_delay_ms,
      connectionPolicy.retry_delay_ms,
      DEFAULT_EXECUTION_POLICY.retry_delay_ms,
    ),
    fallback_connection_id:
      overrides?.fallback_connection_id ??
      connectionPolicy.fallback_connection_id ??
      fallbackFromConnection ??
      DEFAULT_EXECUTION_POLICY.fallback_connection_id,
  };
}

function pickNumber(...values: Array<number | undefined>): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function pickBoolean(...values: Array<boolean | undefined>): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return false;
}

function pickResponseFormat(...values: Array<ResponseFormat | undefined>): ResponseFormat {
  for (const value of values) {
    if (value === "text" || value === "json") return value;
  }
  return "json";
}

export function validateExecutionPolicy(policy: ExecutionRuntimePolicy): void {
  if (policy.max_tokens <= 0) throw new ValidationError("max_tokens must be greater than zero.");
  if (policy.timeout_ms <= 0) throw new ValidationError("timeout_ms must be greater than zero.");
  if (policy.retry_count < 0) throw new ValidationError("retry_count cannot be negative.");
  if (policy.retry_delay_ms < 0) throw new ValidationError("retry_delay_ms cannot be negative.");
}

export function isProviderReportedTokenUsage(
  usage: TokenUsage | null | undefined,
): usage is TokenUsage {
  return Boolean(
    usage &&
      usage.source === "provider" &&
      Number.isFinite(usage.total_tokens) &&
      usage.total_tokens > 0,
  );
}

export function estimateTokenUsage(prompt: string, completionText: string): TokenUsage {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = Math.max(1, Math.ceil(completionText.length / 4));
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

export function normalizeProviderResponse(
  providerKey: string,
  generateResult: GenerateResult,
  promptBuild: PromptBuildSnapshot,
  policy: ExecutionRuntimePolicy,
): { raw: Record<string, unknown>; normalized: NormalizedAIResponse; finishReason: string } {
  const raw = {
    text: generateResult.text,
    model: generateResult.model,
    providerKey: generateResult.providerKey,
    mock: generateResult.mock ?? false,
    response_format: policy.response_format,
    streaming: policy.streaming,
    tokenUsage: generateResult.tokenUsage,
  };

  const targetFormat = policy.response_format ?? promptBuild.output_contract.format ?? "json";
  let content: string | Record<string, unknown> = generateResult.text;
  if (targetFormat === "json") {
    content = {
      reply: generateResult.text,
      confidence: 0.85,
      requires_human: false,
    };
  }

  return {
    raw,
    normalized: {
      content,
      format: targetFormat,
      model: generateResult.model,
      provider_key: providerKey,
      finish_reason: generateResult.finishReason ?? "stop",
    },
    finishReason: generateResult.finishReason ?? "stop",
  };
}

export function assertNotCancelled(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw new AIExecutionCancelledError();
  }
}

export function resolveModel(
  connectionConfiguration: Record<string, unknown>,
  explicitModel?: string | null,
): string {
  if (explicitModel && explicitModel.trim()) return explicitModel;
  if (typeof connectionConfiguration.model === "string" && connectionConfiguration.model.trim()) {
    return connectionConfiguration.model;
  }
  return "default-model";
}
