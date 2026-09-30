/**
 * Isolated sandbox LLM behind the existing EnterpriseAIProvider interface.
 * Used only for local E2E: exercises the real gateway → runtime → tool loop.
 * Never mounted in the public Web Chat route.
 */
import { mergeCapabilities } from "../capabilities/provider-capabilities.js";
import type { ProviderHealthSnapshot } from "../metrics/health-monitor.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  GatewayChatRequest,
  TextGenerationRequest,
} from "../models/request-response.js";
import { createStreamEvent, type AIStreamEvent } from "../streaming/stream-events.js";
import { validateAgainstSchema } from "../utils/validate-configuration.js";
import type { ConfigurationValidationResult } from "../types.js";
import type { EnterpriseAIProvider } from "./enterprise-provider-contract.js";

export const SANDBOX_E2E_PROVIDER_KEY = "sandbox" as const;

export type SandboxLlmInvocation = {
  at: string;
  companyId: string | null;
  conversationId: string | null;
  executionId: string | null;
  userMessage: string;
  systemPrompt: string | null;
  messageRoles: string[];
  toolNamesOffered: string[];
  finishReason: string;
  responseText: string;
  toolCallName: string | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    model: { type: "string" },
    latencyMs: { type: "number" },
    failAlways: { type: "boolean" },
  },
} as const;

const HANDOFF_RE =
  /\b(speak to a human|human agent|talk to (a )?human|handoff|transfer this conversation)\b/i;

let invocations: SandboxLlmInvocation[] = [];
let remainingForcedFailures = 0;

export function resetSandboxE2EInvocations(): void {
  invocations = [];
}

export function getSandboxE2EInvocations(): readonly SandboxLlmInvocation[] {
  return invocations;
}

/** Test/harness only: next N chatCompletion calls throw (existing retry/fallback still apply). */
export function setSandboxE2EForcedFailures(count: number): void {
  remainingForcedFailures = Math.max(0, count);
}

function readContext(input: ChatCompletionRequest): {
  companyId: string | null;
  conversationId: string | null;
  executionId: string | null;
} {
  const ctx = (input as GatewayChatRequest).context;
  return {
    companyId: typeof ctx?.companyId === "string" ? ctx.companyId : null,
    conversationId: typeof ctx?.conversationId === "string" ? ctx.conversationId : null,
    executionId: typeof ctx?.executionId === "string" ? ctx.executionId : null,
  };
}

function offeredToolNames(input: ChatCompletionRequest): string[] {
  if (!Array.isArray(input.tools)) return [];
  const names: string[] = [];
  for (const tool of input.tools) {
    if (!tool || typeof tool !== "object") continue;
    const rec = tool as Record<string, unknown>;
    const fn = rec.function;
    if (fn && typeof fn === "object" && typeof (fn as { name?: unknown }).name === "string") {
      names.push((fn as { name: string }).name);
    } else if (typeof rec.name === "string") {
      names.push(rec.name);
    } else if (typeof rec.key === "string") {
      names.push(rec.key);
    }
  }
  return names;
}

function lastUserMessage(input: ChatCompletionRequest): string {
  return [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
}

export function createSandboxE2EProvider(configuration: Record<string, unknown>): EnterpriseAIProvider {
  return new SandboxE2EProvider(configuration);
}

class SandboxE2EProvider implements EnterpriseAIProvider {
  readonly key = SANDBOX_E2E_PROVIDER_KEY;

  constructor(private readonly configuration: Record<string, unknown>) {}

  validateConfiguration(configuration: Record<string, unknown>): ConfigurationValidationResult {
    return validateAgainstSchema(SCHEMA, configuration);
  }

  discoverCapabilities() {
    return mergeCapabilities(
      {
        supportsChat: true,
        supportsStreaming: true,
        supportsEmbeddings: true,
        supportsVision: false,
        supportsFunctionCalling: true,
        supportsJsonOutput: true,
        supportsTextGeneration: true,
      },
      {},
    );
  }

  private resolveModel(inputModel?: string): string {
    const configured = this.configuration.model;
    if (typeof configured === "string" && configured.trim()) return configured.trim();
    return inputModel ?? "sandbox-e2e";
  }

  async chatCompletion(input: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this.configuration.failAlways === true || remainingForcedFailures > 0) {
      if (remainingForcedFailures > 0) remainingForcedFailures -= 1;
      throw new Error("Sandbox LLM simulated failure.");
    }

    const model = this.resolveModel(input.model);
    const userMessage = lastUserMessage(input);
    const tools = offeredToolNames(input);
    const wantsHuman = HANDOFF_RE.test(userMessage);
    const canEscalate = tools.includes("escalate_to_human");
    const alreadyEscalated = input.messages.some((message) => message.role === "tool");
    const context = readContext(input);

    let text: string;
    let finishReason = "stop";
    let toolCallName: string | null = null;
    const response: ChatCompletionResponse = {
      text: "",
      model,
      providerKey: this.key,
      finishReason,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      estimatedCostUsd: 0,
      providerMetadata: { sandbox: true },
    };

    if (wantsHuman && canEscalate && !alreadyEscalated) {
      toolCallName = "escalate_to_human";
      finishReason = "tool_calls";
      text = "";
      response.toolCalls = [
        {
          id: "sandbox_escalate_1",
          name: "escalate_to_human",
          arguments: { reason: "Visitor asked for a human agent.", triggerCode: "customer_requested" },
        },
      ];
      response.assistantMessage = {
        role: "assistant",
        content: "",
        toolCalls: response.toolCalls,
      };
    } else if (wantsHuman) {
      text = "I've connected you with a human teammate. They will continue this chat.";
    } else {
      text = `I can help with that. You said: "${userMessage || "hello"}"`;
    }

    response.text = text;
    response.finishReason = finishReason;
    response.usage = {
      inputTokens: userMessage.length,
      outputTokens: text.length,
      totalTokens: userMessage.length + text.length,
    };

    invocations.push({
      at: new Date().toISOString(),
      companyId: context.companyId,
      conversationId: context.conversationId,
      executionId: context.executionId,
      userMessage,
      systemPrompt: typeof input.systemPrompt === "string" ? input.systemPrompt : null,
      messageRoles: input.messages.map((message) => message.role),
      toolNamesOffered: tools,
      finishReason,
      responseText: text,
      toolCallName,
    });

    const forbidden = [
      "visitorToken",
      "token_hash",
      "tokenHash",
      "ip_hash",
      "ipHash",
      "ua_hash",
      "userAgentHash",
    ];
    const blob = `${input.systemPrompt ?? ""}\n${input.messages.map((m) => m.content).join("\n")}`;
    if (forbidden.some((key) => blob.includes(key))) {
      response.providerMetadata = { ...response.providerMetadata, leakedSecretKeys: true };
    }

    return response;
  }

  async *streamChatCompletion(input: ChatCompletionRequest): AsyncIterable<AIStreamEvent> {
    const completion = await this.chatCompletion(input);
    yield createStreamEvent("start", this.key, { model: completion.model });
    if (completion.text) {
      yield createStreamEvent("delta", this.key, { delta: completion.text, model: completion.model });
    }
    yield createStreamEvent("done", this.key, {
      model: completion.model,
      finishReason: completion.finishReason,
      usage: completion.usage,
    });
  }

  async generateText(input: TextGenerationRequest): Promise<ChatCompletionResponse> {
    return this.chatCompletion({
      messages: [{ role: "user", content: input.prompt }],
      systemPrompt: input.systemPrompt,
      model: input.model,
    });
  }

  async createEmbeddings(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const values = Array.isArray(input.input) ? input.input : [input.input];
    return {
      vectors: values.map(() => [0.1, 0.2, 0.3, 0.4]),
      model: this.resolveModel(input.model),
      providerKey: this.key,
      dimensions: 4,
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
      latencyMs: 0,
      estimatedCostUsd: 0,
    };
  }

  async healthCheck(): Promise<ProviderHealthSnapshot> {
    return {
      providerKey: this.key,
      available: true,
      latencyMs: 0,
      lastError: null,
      successRate: 1,
      checkedAt: new Date().toISOString(),
    };
  }
}
