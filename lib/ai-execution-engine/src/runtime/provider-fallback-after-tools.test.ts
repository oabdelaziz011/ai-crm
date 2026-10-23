import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

const quoteOutput = {
  success: true,
  quoteId: "quote-1",
  draftOnly: true,
  sent: false,
};

function quoteTools(executed: string[]) {
  return {
    allowedToolKeys: () => ["create_draft_quote", "request_send_quote"],
    async route(_ctx: unknown, request: { toolKey: string }) {
      executed.push(request.toolKey);
      if (request.toolKey === "request_send_quote") {
        throw new Error("quote send must not run");
      }
      return {
        toolKey: request.toolKey,
        executionId: "exec-quote",
        status: "succeeded" as const,
        output: quoteOutput,
        durationMs: 1,
      };
    },
  };
}

function gatewayRequest(content: string) {
  return {
    messages: [{ role: "user" as const, content }],
    providerKey: "openai",
    model: "gpt-4o-mini",
    context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
  };
}

describe("provider fallback after persisted sales tools", () => {
  it("returns one localized fallback after a simulated rate limit and does not call the provider again", async () => {
    let modelCalls = 0;
    let streamCalls = 0;
    const executed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {
            text: "",
            model: "gpt-4o-mini",
            providerKey: "openai",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
            latencyMs: 5,
            toolCalls: [{ id: "call-quote", name: "create_draft_quote", arguments: { productId: "product-1" } }],
          };
        }
        throw new Error("provider_rate_limit_exceeded");
      },
      async *streamChatCompletion() {
        streamCalls += 1;
        throw new Error("stream_must_not_run");
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools: quoteTools(executed) });
    const result = await loop.runWithOptionalStreaming({
      ctx,
      conversationId: "conversation-1",
      deferDeterministicSales: true,
      onStreamChunk: () => undefined,
      gatewayRequest: gatewayRequest("ابغى اشتري النظام ده دلوقتي"),
      tools: [{ type: "function", function: { name: "create_draft_quote" } }],
      allowedToolKeys: ["create_draft_quote", "request_send_quote"],
    });

    assert.equal(modelCalls, 2);
    assert.equal(streamCalls, 0);
    assert.deepEqual(executed, ["create_draft_quote"]);
    assert.equal(result.toolExecutions[0]?.output?.quoteId, "quote-1");
    assert.equal(result.response.finishReason, "fallback");
    assert.match(result.response.text, /مسودة/);
    assert.match(result.response.text, /لم يتم إرسالها/);
    assert.equal(result.response.text.includes("provider_rate_limit_exceeded"), false);
  });

  it("uses the same fallback when the model returns an empty response after the tool", async () => {
    let modelCalls = 0;
    const executed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {
            text: "",
            model: "gpt-4o-mini",
            providerKey: "openai",
            finishReason: "tool_calls",
            usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
            latencyMs: 3,
            toolCalls: [{ id: "call-quote", name: "create_draft_quote", arguments: {} }],
          };
        }
        return {
          text: "",
          model: "gpt-4o-mini",
          providerKey: "openai",
          finishReason: "stop",
          usage: { inputTokens: 8, outputTokens: 0, totalTokens: 8 },
          latencyMs: 2,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools: quoteTools(executed) });
    const result = await loop.run({
      ctx,
      conversationId: "conversation-1",
      deferDeterministicSales: true,
      gatewayRequest: gatewayRequest("Please prepare a quote"),
      tools: [{ type: "function", function: { name: "create_draft_quote" } }],
      allowedToolKeys: ["create_draft_quote", "request_send_quote"],
    });
    assert.equal(modelCalls, 2);
    assert.equal(result.response.finishReason, "fallback");
    assert.match(result.response.text, /draft quote was saved/i);
    assert.match(result.response.text, /not sent/i);
    assert.deepEqual(executed, ["create_draft_quote"]);
  });

  it("keeps a provider failure that happens before any successful tool", async () => {
    let modelCalls = 0;
    const executed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        throw new Error("provider_rate_limit_exceeded");
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools: quoteTools(executed) });
    await assert.rejects(
      () =>
        loop.run({
          ctx,
          conversationId: "conversation-1",
          deferDeterministicSales: true,
          gatewayRequest: gatewayRequest("Please prepare a quote"),
          tools: [{ type: "function", function: { name: "create_draft_quote" } }],
          allowedToolKeys: ["create_draft_quote", "request_send_quote"],
        }),
      /provider_rate_limit_exceeded/,
    );
    assert.equal(modelCalls, 1);
    assert.deepEqual(executed, []);
  });

  it("does not hide a validation error that happens after a successful tool", async () => {
    let modelCalls = 0;
    const executed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        if (modelCalls === 1) {
          return {
            text: "",
            model: "gpt-4o-mini",
            providerKey: "openai",
            finishReason: "tool_calls",
            usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
            latencyMs: 3,
            toolCalls: [{ id: "call-quote", name: "create_draft_quote", arguments: {} }],
          };
        }
        throw new Error("Permission denied: leads.qualify");
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools: quoteTools(executed) });
    await assert.rejects(
      () =>
        loop.run({
          ctx,
          conversationId: "conversation-1",
          deferDeterministicSales: true,
          gatewayRequest: gatewayRequest("Please prepare a quote"),
          tools: [{ type: "function", function: { name: "create_draft_quote" } }],
          allowedToolKeys: ["create_draft_quote", "request_send_quote"],
        }),
      /Permission denied/,
    );
    assert.deepEqual(executed, ["create_draft_quote"]);
  });
});
