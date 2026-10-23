import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";
import { ToolCallLoopService } from "./tool-call-loop-service.js";

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

function silentGateway(): RuntimeGatewayPort {
  return {
    async chatCompletion() {
      return {
        text: "Noted.",
        model: "mock",
        providerKey: "mock",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      };
    },
  };
}

describe("customer language after tools", () => {
  it("quotes a product price in the customer's language", async () => {
    const tools: RuntimeToolPort = {
      async route() {
        return {
          executionId: "exec-1",
          toolKey: "search_products",
          status: "succeeded",
          output: {
            success: true,
            products: [
              {
                name: "Kopfhörer",
                sku: "KH-1",
                price: { status: "listed", amount: 40, currency: "EUR" },
              },
            ],
          },
          durationMs: 1,
        };
      },
      listLlmTools() {
        return [];
      },
      allowedToolKeys() {
        return ["search_products"];
      },
    };
    const loop = new ToolCallLoopService({ gateway: silentGateway(), tools });
    const english = await loop.run({
      ctx,
      conversationId: "conv-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "What is the price of the headphones product?" }],
        model: "mock",
      },
      tools: [
        {
          type: "function",
          function: { name: "search_products", description: "Search products", parameters: { type: "object", properties: {} } },
        },
      ],
      allowedToolKeys: ["search_products"],
    });
    assert.match(english.response.text, /Price of Kopfhörer \(KH-1\): 40 EUR/);
    assert.equal(/[\u0600-\u06FF]/.test(english.response.text), false);

    const german = await loop.run({
      ctx,
      conversationId: "conv-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "Was ist der Preis von dem Produkt Kopfhörer?" }],
        model: "mock",
      },
      tools: [
        {
          type: "function",
          function: { name: "search_products", description: "Search products", parameters: { type: "object", properties: {} } },
        },
      ],
      allowedToolKeys: ["search_products"],
    });
    assert.match(german.response.text, /Preis von Kopfhörer \(KH-1\): 40 EUR/);
  });

  it("answers the next open time from the tool slot in English", async () => {
    const routed: string[] = [];
    const tools: RuntimeToolPort = {
      async route(_ctx, input) {
        routed.push(input.toolKey);
        return {
          executionId: "exec-next",
          toolKey: input.toolKey,
          status: "succeeded",
          output: {
            success: true,
            slot: { date: "2026-08-26", start: "10:00", resourceName: "ADAM" },
            customerFacingMessage: "أقرب موعد متاح: يوم 2026-08-26 الساعة 10:00 مع ADAM.",
          },
          durationMs: 1,
        };
      },
      listLlmTools() {
        return [];
      },
      allowedToolKeys() {
        return ["find_next_available", "search_availability"];
      },
    };
    const loop = new ToolCallLoopService({ gateway: silentGateway(), tools });
    const result = await loop.run({
      ctx,
      conversationId: "conv-1",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content: "- Clinic: serviceId=11111111-1111-4111-8111-111111111111",
          },
          { role: "user", content: "What is the next available time?" },
        ],
        model: "mock",
      },
      tools: [
        {
          type: "function",
          function: { name: "find_next_available", description: "Nearest slot", parameters: { type: "object", properties: {} } },
        },
        {
          type: "function",
          function: { name: "search_availability", description: "Open times", parameters: { type: "object", properties: {} } },
        },
      ],
      allowedToolKeys: ["find_next_available", "search_availability"],
    });
    assert.deepEqual(routed, ["find_next_available"]);
    assert.match(result.response.text, /Next open time: 2026-08-26 at 10:00 with ADAM/);
    assert.equal(result.response.text.includes("أقرب موعد"), false);
  });
});
