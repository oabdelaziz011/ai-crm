import { mergeCapabilities } from "../capabilities/provider-capabilities.js";
import type { ProviderHealthSnapshot } from "../metrics/health-monitor.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  TextGenerationRequest,
} from "../models/request-response.js";
import { createStreamEvent } from "../streaming/stream-events.js";
import type { ConfigurationValidationResult, GenerateResult } from "../types.js";
import type { AIProvider } from "./provider-contract.js";
import type { EnterpriseAIProvider } from "./enterprise-provider-contract.js";

function toTokenUsage(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
  };
}

function messagesToPrompt(input: ChatCompletionRequest): string {
  const lines: string[] = [];
  if (input.systemPrompt?.trim()) lines.push(`System: ${input.systemPrompt.trim()}`);
  for (const message of input.messages) {
    lines.push(`${message.role[0]?.toUpperCase()}${message.role.slice(1)}: ${message.content}`);
  }
  return lines.join("\n");
}

export function wrapLegacyProviderAsEnterprise(
  provider: AIProvider,
  capabilities: ReturnType<EnterpriseAIProvider["discoverCapabilities"]>,
): EnterpriseAIProvider {
  return {
    key: provider.key,
    discoverCapabilities: () => capabilities,
    validateConfiguration: (configuration) => provider.validateConfiguration(configuration),
    async chatCompletion(input) {
      const started = Date.now();
      const result = await provider.generate({
        prompt: messagesToPrompt(input),
        model: input.model,
        metadata: {
          temperature: input.temperature,
          max_tokens: input.maxTokens,
          top_p: input.topP,
          chatMessages: input.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
            ...(message.toolCalls
              ? {
                  tool_calls: message.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function" as const,
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.arguments),
                    },
                  })),
                }
              : {}),
          })),
          tools: input.tools,
          toolChoice: input.tools?.length ? "auto" : undefined,
          ...input.metadata,
        },
      });
      return {
        text: result.text,
        model: result.model,
        providerKey: result.providerKey,
        finishReason: result.finishReason ?? "stop",
        usage: toTokenUsage(result.tokenUsage),
        latencyMs: Date.now() - started,
        providerMetadata: { mock: result.mock ?? false },
        toolCalls: result.toolCalls?.map((call) => ({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        })),
        assistantMessage: result.rawAssistantMessage
          ? {
              role: "assistant" as const,
              content: result.text,
              toolCalls: result.toolCalls,
            }
          : undefined,
      };
    },
    async *streamChatCompletion(input) {
      yield createStreamEvent("start", provider.key, { model: input.model });

      const pendingChunks: string[] = [];
      let resolveWait: (() => void) | null = null;
      let streamDone = false;
      let streamError: Error | null = null;
      let streamResult: GenerateResult | null = null;

      const notify = () => {
        resolveWait?.();
        resolveWait = null;
      };

      const generatePromise = provider
        .generate({
          prompt: messagesToPrompt(input),
          model: input.model,
          metadata: {
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            top_p: input.topP,
            streaming: true,
            onChunk: (chunk: string) => {
              pendingChunks.push(chunk);
              notify();
            },
            ...input.metadata,
          },
        })
        .then((result) => {
          streamResult = result;
          streamDone = true;
          notify();
        })
        .catch((error: unknown) => {
          streamError = error instanceof Error ? error : new Error(String(error));
          streamDone = true;
          notify();
        });

      while (!streamDone || pendingChunks.length > 0) {
        while (pendingChunks.length > 0) {
          const chunk = pendingChunks.shift()!;
          yield createStreamEvent("delta", provider.key, { delta: chunk, model: input.model });
        }
        if (streamDone) break;
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }

      await generatePromise;

      if (streamError) {
        yield createStreamEvent("error", provider.key, {
          errorMessage: streamError.message,
          model: input.model,
        });
        throw streamError;
      }

      if (!streamResult) {
        throw new Error("Streaming provider returned no result.");
      }

      const completedResult: GenerateResult = streamResult;

      yield createStreamEvent("done", provider.key, {
        model: completedResult.model ?? input.model,
        finishReason: completedResult.finishReason ?? "stop",
        usage: toTokenUsage(completedResult.tokenUsage),
      });
    },
    async generateText(input) {
      const started = Date.now();
      const prompt = input.systemPrompt ? `System: ${input.systemPrompt}\nUser: ${input.prompt}` : input.prompt;
      const result = await provider.generate({
        prompt,
        model: input.model,
        metadata: {
          temperature: input.temperature,
          max_tokens: input.maxTokens,
          top_p: input.topP,
          ...input.metadata,
        },
      });
      return {
        text: result.text,
        model: result.model,
        providerKey: result.providerKey,
        finishReason: result.finishReason ?? "stop",
        usage: toTokenUsage(result.tokenUsage),
        latencyMs: Date.now() - started,
        providerMetadata: { mock: result.mock ?? false },
      };
    },
    async createEmbeddings(input) {
      const started = Date.now();
      const values = Array.isArray(input.input) ? input.input : [input.input];
      const vectors = await Promise.all(
        values.map(async (text) => {
          const result = await provider.embed({ text, model: input.model, metadata: input.metadata });
          return result.vector;
        }),
      );
      return {
        vectors,
        model: input.model ?? "embedding-model",
        providerKey: provider.key,
        dimensions: vectors[0]?.length ?? 0,
        usage: { inputTokens: values.join("").length, outputTokens: 0, totalTokens: values.join("").length },
        latencyMs: Date.now() - started,
      };
    },
    async healthCheck(): Promise<ProviderHealthSnapshot> {
      const started = Date.now();
      const health = await provider.health();
      return {
        providerKey: provider.key,
        available: health.status === "connected",
        latencyMs: Date.now() - started,
        lastError: health.status === "connected" ? null : health.message,
        successRate: health.status === "connected" ? 1 : 0,
        checkedAt: health.checkedAt,
      };
    },
  };
}

export function defaultCapabilitiesForProvider(key: string) {
  if (key === "mock") {
    return mergeCapabilities(
      {
        supportsChat: true,
        supportsStreaming: true,
        supportsEmbeddings: true,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsJsonOutput: true,
        supportsTextGeneration: true,
      },
      {},
    );
  }
  if (key === "openai" || key === "azure_openai") {
    return mergeCapabilities(
      {
        supportsChat: true,
        supportsStreaming: true,
        supportsEmbeddings: true,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsJsonOutput: true,
        supportsTextGeneration: true,
      },
      {},
    );
  }
  if (key === "claude" || key === "gemini") {
    return mergeCapabilities(
      {
        supportsChat: true,
        supportsStreaming: true,
        supportsEmbeddings: key === "gemini",
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsJsonOutput: true,
        supportsTextGeneration: true,
      },
      {},
    );
  }
  if (key === "ollama") {
    return mergeCapabilities(
      {
        supportsChat: true,
        supportsStreaming: true,
        supportsEmbeddings: true,
        supportsVision: false,
        supportsFunctionCalling: false,
        supportsJsonOutput: false,
        supportsTextGeneration: true,
      },
      {},
    );
  }
  return mergeCapabilities(
    {
      supportsChat: true,
      supportsStreaming: false,
      supportsEmbeddings: true,
      supportsVision: false,
      supportsFunctionCalling: false,
      supportsJsonOutput: false,
      supportsTextGeneration: true,
    },
    {},
  );
}
