import type { AIGatewayService } from "@workspace/ai-provider-layer";
import {
  metadataNeedsPlatformAiProxy,
  platformAiChatCompletion,
} from "@/lib/platform-ai/platform-ai-api-client";

/**
 * Wraps the AI gateway so platform-managed credentials are resolved and used
 * only on api-server — never in the browser.
 */
export function createBrowserSafeAIGateway(gateway: AIGatewayService): AIGatewayService {
  return new Proxy(gateway, {
    get(target, prop, receiver) {
      if (prop === "chatCompletion") {
        return async (input: Parameters<AIGatewayService["chatCompletion"]>[0]) => {
          const metadata = (input.metadata ?? {}) as Record<string, unknown>;
          if (!metadataNeedsPlatformAiProxy(metadata)) {
            return target.chatCompletion(input);
          }

          const companyId = input.context.companyId;
          if (!companyId) {
            throw new Error("companyId is required for platform AI proxy.");
          }

          const response = await platformAiChatCompletion({
            companyId,
            providerKey: input.providerKey,
            useCase: Array.isArray(input.tools) && input.tools.length > 0 ? "tool_calling" : "chat",
            model: input.model,
            messages: input.messages as Array<Record<string, unknown>>,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            topP: input.topP,
            tools: input.tools,
            conversationId: input.context.conversationId,
            executionId: input.context.executionId,
            responseFormat: metadata.response_format === "json" ? "json" : "text",
          });

          return {
            text: response.text,
            model: response.model,
            providerKey: response.providerKey,
            finishReason: response.finishReason,
            usage: response.usage,
            latencyMs: response.latencyMs,
            estimatedCostUsd: response.estimatedCostUsd,
            toolCalls: response.toolCalls,
            assistantMessage: response.assistantMessage as never,
          };
        };
      }

      if (prop === "streamChatCompletion") {
        return async function* (input: Parameters<NonNullable<AIGatewayService["streamChatCompletion"]>>[0]) {
          const metadata = (input.metadata ?? {}) as Record<string, unknown>;
          if (!metadataNeedsPlatformAiProxy(metadata)) {
            const inner = target.streamChatCompletion;
            if (!inner) {
              throw new Error("streamChatCompletion is not available.");
            }
            yield* inner.call(target, input);
            return;
          }

          // Proxy path: non-streaming completion exposed as a minimal stream.
          const companyId = input.context.companyId;
          if (!companyId) {
            throw new Error("companyId is required for platform AI proxy.");
          }
          const response = await platformAiChatCompletion({
            companyId,
            providerKey: input.providerKey,
            useCase: Array.isArray(input.tools) && input.tools.length > 0 ? "tool_calling" : "chat",
            model: input.model,
            messages: input.messages as Array<Record<string, unknown>>,
            temperature: input.temperature,
            maxTokens: input.maxTokens,
            topP: input.topP,
            tools: input.tools,
            conversationId: input.context.conversationId,
            executionId: input.context.executionId,
          });

          yield {
            type: "start",
            providerKey: response.providerKey,
            data: { model: response.model },
          } as never;
          if (response.text) {
            yield {
              type: "delta",
              providerKey: response.providerKey,
              data: { content: response.text },
            } as never;
          }
          yield {
            type: "done",
            providerKey: response.providerKey,
            data: {
              text: response.text,
              finishReason: response.finishReason,
              usage: response.usage,
              toolCalls: response.toolCalls,
            },
          } as never;
        };
      }

      if (prop === "createEmbeddings") {
        return async (input: Parameters<AIGatewayService["createEmbeddings"]>[0]) => {
          const metadata = (input.metadata ?? {}) as Record<string, unknown>;
          if (!metadataNeedsPlatformAiProxy(metadata)) {
            return target.createEmbeddings(input);
          }
          // Embeddings for platform keys go through dedicated retrieval proxy path.
          // Keep gateway.createEmbeddings local-only unless metadata has a real key.
          throw new Error(
            "Platform-managed embeddings must use the Platform AI embeddings API (not browser credentials).",
          );
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
