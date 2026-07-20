import { mergeCapabilities } from "../capabilities/provider-capabilities.js";
import type { ProviderHealthSnapshot } from "../metrics/health-monitor.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  TextGenerationRequest,
} from "../models/request-response.js";
import { createStreamEvent, type AIStreamEvent } from "../streaming/stream-events.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { ConfigurationValidationResult } from "../types.js";
import type { EnterpriseAIProvider } from "./enterprise-provider-contract.js";

const MOCK_CONFIGURATION_SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    latencyMs: { type: "number" },
    failureRate: { type: "number" },
  },
  required: ["model"],
} as const;

export function createMockEnterpriseProvider(configuration: Record<string, unknown>): EnterpriseAIProvider {
  return new MockEnterpriseProvider(configuration);
}

class MockEnterpriseProvider implements EnterpriseAIProvider {
  readonly key = "mock";

  constructor(private readonly configuration: Record<string, unknown>) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(MOCK_CONFIGURATION_SCHEMA, configuration);
  }

  private resolveModel(inputModel?: string): string {
    const configured = this.configuration.model;
    if (typeof configured === "string" && configured.trim()) return configured;
    return inputModel ?? "mock-gpt";
  }

  private async simulateLatency(): Promise<void> {
    const latencyMs = Number(this.configuration.latencyMs ?? 5);
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    const failureRate = Number(this.configuration.failureRate ?? 0);
    if (failureRate > 0 && Math.random() < failureRate) {
      throw new Error("Mock provider simulated failure.");
    }
  }

  discoverCapabilities() {
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

  async chatCompletion(input: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    await this.simulateLatency();
    const model = this.resolveModel(input.model);
    const userMessage = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const text = `[mock] ${userMessage || "Hello from the mock provider."}`;
    return {
      text,
      model,
      providerKey: this.key,
      finishReason: "stop",
      usage: { inputTokens: text.length, outputTokens: text.length, totalTokens: text.length * 2 },
      latencyMs: Number(this.configuration.latencyMs ?? 5),
      estimatedCostUsd: 0,
      providerMetadata: { mock: true },
    };
  }

  async *streamChatCompletion(input: ChatCompletionRequest): AsyncIterable<AIStreamEvent> {
    const model = this.resolveModel(input.model);
    const text = `[mock-stream] ${input.messages.at(-1)?.content ?? "stream"}`;
    yield createStreamEvent("start", this.key, { model });
    for (const chunk of text.split(" ")) {
      await this.simulateLatency();
      yield createStreamEvent("delta", this.key, { delta: `${chunk} `, model });
    }
    yield createStreamEvent("done", this.key, {
      model,
      finishReason: "stop",
      usage: { inputTokens: 12, outputTokens: text.length, totalTokens: 12 + text.length },
    });
  }

  async generateText(input: TextGenerationRequest): Promise<ChatCompletionResponse> {
    return this.chatCompletion({
      messages: [{ role: "user", content: input.prompt }],
      systemPrompt: input.systemPrompt,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
      metadata: input.metadata,
    });
  }

  async createEmbeddings(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    await this.simulateLatency();
    const values = Array.isArray(input.input) ? input.input : [input.input];
    const vectors = values.map((text) => hashToVector(text, 8));
    return {
      vectors,
      model: this.resolveModel(input.model),
      providerKey: this.key,
      dimensions: 8,
      usage: { inputTokens: values.join("").length, outputTokens: 0, totalTokens: values.join("").length },
      latencyMs: Number(this.configuration.latencyMs ?? 5),
      estimatedCostUsd: 0,
    };
  }

  async healthCheck(): Promise<ProviderHealthSnapshot> {
    const validation = this.validateConfiguration(this.configuration);
    return {
      providerKey: this.key,
      available: validation.valid,
      latencyMs: Number(this.configuration.latencyMs ?? 5),
      lastError: validation.valid ? null : validation.errors.join("; "),
      successRate: validation.valid ? 1 : 0,
      checkedAt: new Date().toISOString(),
    };
  }
}

function hashToVector(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, (_, index) => 0);
  for (let i = 0; i < text.length; i += 1) {
    vector[i % dimensions] = (vector[i % dimensions] + text.charCodeAt(i)) % 997;
  }
  return vector.map((value) => Number((value / 997).toFixed(4)));
}
