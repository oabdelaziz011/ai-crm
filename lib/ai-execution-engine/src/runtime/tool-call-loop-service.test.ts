import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";

describe("ToolCallLoopService", () => {
  it("synthesizes a final reply when the tool loop ends without assistant text", async () => {
    let completionCalls = 0;

    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        completionCalls += 1;

        if (input.tools?.length) {
          if (completionCalls === 1) {
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
                  name: "knowledge_search",
                  arguments: { query: "support docs" },
                },
              ],
            };
          }

          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 12, outputTokens: 0, totalTokens: 12 },
            latencyMs: 4,
          };
        }

        return {
          text: "Here is the answer after tool results.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 7,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["knowledge_search"],
      route: async () => ({
        toolKey: "knowledge_search",
        executionId: "exec-1",
        status: "succeeded",
        output: { success: true, contextText: "No knowledge documents matched this query." },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "Find support docs" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "knowledge_search" } }],
      allowedToolKeys: ["knowledge_search"],
    });

    assert.equal(completionCalls, 3);
    assert.equal(result.toolExecutions.length, 1);
    assert.equal(result.response.text, "Here is the answer after tool results.");
    assert.equal(result.response.finishReason, "stop");
  });
});
