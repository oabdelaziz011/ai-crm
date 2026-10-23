import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";
import { salesCalendarYmd } from "./sales-conversation-turn.js";

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

const CATALOG_PRODUCT_ID = "979845ef-bcae-43a0-a81c-6e9cd657d7bd";

describe("official assistant tool loop", () => {
  it("lets the model select demo tools and does not book when the model stops first", async () => {
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
            usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
            latencyMs: 5,
            toolCalls: [{ id: "call-list", name: "list_demo_types", arguments: {} }],
          };
        }
        return {
          text: "I listed the published demos. Which time should I use?",
          model: "gpt-4o-mini",
          providerKey: "openai",
          finishReason: "stop",
          usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
          latencyMs: 4,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["list_demo_types", "search_demo_availability", "create_demo_booking"],
      async route(_ctx: unknown, request: { toolKey: string }) {
        executed.push(request.toolKey);
        if (request.toolKey === "create_demo_booking") {
          throw new Error("unit test must not book a demo slot");
        }
        return {
          toolKey: request.toolKey,
          executionId: "exec-list",
          status: "succeeded" as const,
          output: {
            success: true,
            demos: [{ serviceId: CATALOG_PRODUCT_ID, name: "ValueOR Software" }],
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx,
      conversationId: "conversation-1",
      deferDeterministicSales: true,
      gatewayRequest: {
        messages: [{ role: "user", content: "Please book a product demo today at 15:00" }],
        providerKey: "openai",
        model: "gpt-4o-mini",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "list_demo_types" } }],
      allowedToolKeys: ["list_demo_types", "search_demo_availability", "create_demo_booking"],
    });
    assert.equal(modelCalls, 2);
    assert.deepEqual(executed, ["list_demo_types"]);
    assert.equal(result.toolExecutions[0]?.toolKey, "list_demo_types");
    assert.equal(result.response.finishReason, "stop");
    assert.match(result.response.text, /published demos/);
  });

  it("keeps the deterministic demo turn off the model and does not persist a declined slot", async () => {
    let modelCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        modelCalls += 1;
        throw new Error("model_should_not_be_called");
      },
    };
    const seen: Array<Record<string, unknown>> = [];
    const tools = {
      allowedToolKeys: () => ["list_demo_types", "create_demo_booking"],
      async route(_ctx: unknown, request: { toolKey: string; input: Record<string, unknown> }) {
        seen.push({ toolKey: request.toolKey, ...request.input });
        if (request.toolKey === "list_demo_types") {
          return {
            toolKey: request.toolKey,
            executionId: "exec-list",
            status: "succeeded" as const,
            output: { demos: [{ serviceId: CATALOG_PRODUCT_ID, name: "ValueOR Software" }] },
            durationMs: 1,
          };
        }
        return {
          toolKey: request.toolKey,
          executionId: "exec-book",
          status: "failed" as const,
          output: { success: false, bookingPersisted: false },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx,
      conversationId: "conversation-2",
      gatewayRequest: {
        messages: [{ role: "user", content: "Please book a product demo today at 15:00" }],
        providerKey: "openai",
        model: "gpt-4o-mini",
        context: { companyId: "company-1", conversationId: "conversation-2", userId: "user-1" },
      },
      tools: [],
      allowedToolKeys: ["list_demo_types", "create_demo_booking"],
    });
    assert.equal(modelCalls, 0);
    assert.equal(seen[1]?.date, salesCalendarYmd(0));
    assert.equal(seen[1]?.slotStart, "15:00");
    assert.equal(seen[1]?.serviceId, CATALOG_PRODUCT_ID);
    assert.match(result.response.text, /not booked/i);
  });
});
