import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  executeSearchAvailability,
  createSchedulingEnginePortFromAdapters,
  SEARCH_AVAILABILITY_TOOL_KEY,
} from "./index.js";
import { ToolCallLoopService } from "@workspace/ai-execution-engine";
import type { RuntimeGatewayPort, RuntimeToolPort } from "@workspace/ai-execution-engine";

describe("search_availability engine integration", () => {
  it("invokes availability and slot engines with no mock handlers in the path", async () => {
    const calls: string[] = [];

    const engines = createSchedulingEnginePortFromAdapters({
      availabilityEngine: {
        async resolveAvailability() {
          calls.push("resolveAvailability");
          return {
            available: true,
            date: "2026-08-01",
            resourceId: "resource-1",
            serviceId: "service-1",
          };
        },
      },
      slotGenerationEngine: {
        async getAvailableSlots() {
          calls.push("getAvailableSlots");
          return {
            available: true,
            date: "2026-08-01",
            timezone: "UTC",
            resourceId: "resource-1",
            serviceId: "service-1",
            durationMinutes: 30,
            slots: ["09:00"],
            generatedSlots: [{ start: "09:00", end: "09:30" }],
          };
        },
        async getAvailableSlotsBatch() {
          calls.push("getAvailableSlotsBatch");
          return [];
        },
      },
    });

    const mockClient = {
      from(table: string) {
        if (table === "scheduling_services") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({ data: { duration_minutes: 30 }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "scheduling_booking_rules") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { max_booking_window_days: 14 }, error: null }),
              }),
            }),
          };
        }
        if (table === "scheduling_resources") {
          return {
            select: () => ({
              eq: () => ({
                in: () => ({
                  eq: () => ({
                    is: async () => ({
                      data: [{ id: "resource-1", name: "Dr. Ada", metadata: { capacity: 2 } }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const result = await executeSearchAvailability(mockClient as never, engines, {
      companyId: "company-1",
      userId: "user-1",
      serviceId: "service-1",
      resourceId: "resource-1",
      date: "2026-08-01",
    });

    assert.equal(result.resources[0]?.resourceName, "Dr. Ada");
    assert.equal(result.resources[0]?.capacity, 2);
    assert.deepEqual(result.resources[0]?.slots, [{ date: "2026-08-01", start: "09:00", end: "09:30" }]);
    assert.ok(calls.includes("resolveAvailability"));
    assert.ok(calls.includes("getAvailableSlots"));
    assert.equal(calls.includes("appointment_lookup"), false);
  });

  it("delivers search_availability slots to the LLM tool loop", async () => {
    const tools: RuntimeToolPort = {
      async route(_ctx, input) {
        return {
          executionId: "exec-1",
          toolKey: input.toolKey,
          status: "succeeded",
          output: {
            success: true,
            availableDates: ["2026-08-01"],
            resources: [
              {
                resourceId: "resource-1",
                resourceName: "Dr. Ada",
                durationMinutes: 30,
                capacity: 1,
                slots: [{ date: "2026-08-01", start: "09:00", end: "09:30" }],
              },
            ],
          },
          durationMs: 3,
        };
      },
      listLlmTools() {
        return [
          {
            type: "function",
            function: {
              name: SEARCH_AVAILABILITY_TOOL_KEY,
              description: "Search availability",
              parameters: {
                type: "object",
                properties: { serviceId: { type: "string" } },
                required: ["serviceId"],
              },
            },
          },
        ];
      },
      allowedToolKeys() {
        return [SEARCH_AVAILABILITY_TOOL_KEY];
      },
    };

    let capturedTools: unknown[] | undefined;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        capturedTools = input.tools;
        if (!input.messages.some((message) => message.role === "tool")) {
          return {
            text: "",
            model: "mock",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-1",
                name: SEARCH_AVAILABILITY_TOOL_KEY,
                arguments: { serviceId: "service-1", date: "2026-08-01" },
              },
            ],
          };
        }

        return {
          text: "Found slot 09:00 with Dr. Ada.",
          model: "mock",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
          latencyMs: 2,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: {
        userId: "user-1",
        companyId: "company-1",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      conversationId: "conv-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "What times are open tomorrow?" }],
        model: "mock",
      },
      tools: tools.listLlmTools(),
      allowedToolKeys: tools.allowedToolKeys(),
    });

    assert.equal(capturedTools?.length, 1);
    assert.match(result.response.text, /09:00/);
  });
});
