import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";

const CREATE_CUSTOMER_TOOL_KEY = "create_customer";

function createRecordingToolPort(onRoute: (input: Record<string, unknown>) => void): RuntimeToolPort {
  return {
    async route(_ctx, input) {
      onRoute(input as Record<string, unknown>);
      return {
        executionId: "exec-tool-1",
        toolKey: input.toolKey,
        status: "succeeded",
        output: { success: true, customerId: "cust-1", message: "Customer created successfully" },
        durationMs: 5,
      };
    },
    listLlmTools() {
      return [
        {
          type: "function",
          function: {
            name: CREATE_CUSTOMER_TOOL_KEY,
            description: "Create customer",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                phone: { type: "string" },
              },
              required: ["name", "phone"],
            },
          },
        },
      ];
    },
    allowedToolKeys() {
      return [CREATE_CUSTOMER_TOOL_KEY];
    },
  };
}

describe("Webhook Tool Router integration", () => {
  it("routes LLM tool calls through the runtime tools port", async () => {
    const routed: Array<Record<string, unknown>> = [];
    const tools = createRecordingToolPort((input) => routed.push(input));

    let callCount = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        callCount += 1;
        if (callCount === 1) {
          assert.ok(Array.isArray(input.tools) && input.tools.length > 0);
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
            latencyMs: 5,
            toolCalls: [
              {
                id: "call-1",
                name: CREATE_CUSTOMER_TOOL_KEY,
                arguments: { name: "WhatsApp Lead", phone: "01012345678" },
              },
            ],
          };
        }

        return {
          text: "Customer created for WhatsApp Lead.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 8,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: {
        userId: "owner-1",
        companyId: "company-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      conversationId: "conv-whatsapp-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "Create customer Ahmed 01012345678" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conv-whatsapp-1" },
      },
      tools: tools.listLlmTools(),
      allowedToolKeys: tools.allowedToolKeys(),
    });

    assert.equal(routed.length, 1);
    assert.equal(routed[0]?.toolKey, CREATE_CUSTOMER_TOOL_KEY);
    assert.equal(routed[0]?.triggeredBy, "llm");
    assert.equal(routed[0]?.conversationId, "conv-whatsapp-1");
    assert.deepEqual(routed[0]?.input, { name: "WhatsApp Lead", phone: "01012345678" });
    assert.equal(result.toolExecutions.length, 1);
    assert.equal(result.toolExecutions[0]?.status, "succeeded");
    assert.match(result.response.text, /Customer created/);
  });

  it("returns normal text responses without invoking the runtime tools port", async () => {
    const routed: Array<Record<string, unknown>> = [];
    const tools = createRecordingToolPort((input) => routed.push(input));

    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        assert.ok(Array.isArray(input.tools));
        return {
          text: "Hello! How can I help you today?",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 6, totalTokens: 16 },
          latencyMs: 4,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: {
        userId: "owner-1",
        companyId: "company-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      conversationId: "conv-whatsapp-2",
      gatewayRequest: {
        messages: [{ role: "user", content: "Hello" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conv-whatsapp-2" },
      },
      tools: tools.listLlmTools(),
      allowedToolKeys: tools.allowedToolKeys(),
    });

    assert.equal(routed.length, 0);
    assert.equal(result.toolExecutions.length, 0);
    assert.equal(result.response.text, "Hello! How can I help you today?");
  });

  it("skips the tool loop when no runtime tools port is configured", async () => {
    let toolsPassed: unknown;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        toolsPassed = input.tools;
        return {
          text: "Plain completion",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
          latencyMs: 2,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway });
    const result = await loop.run({
      ctx: {
        userId: null,
        companyId: "company-1",
        isSuperAdmin: true,
        hasPermission: () => true,
      },
      conversationId: "conv-whatsapp-3",
      gatewayRequest: {
        messages: [{ role: "user", content: "Hi" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conv-whatsapp-3" },
      },
      tools: [],
      allowedToolKeys: [],
    });

    assert.equal(toolsPassed, undefined);
    assert.equal(result.toolExecutions.length, 0);
    assert.equal(result.response.text, "Plain completion");
  });
});
