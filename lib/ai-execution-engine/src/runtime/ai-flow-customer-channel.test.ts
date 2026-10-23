import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { supportHoursAreOpen, ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayChatResponse, RuntimeGatewayPort } from "../ports/runtime-ports.js";

/** Customer-facing WhatsApp tool set: scheduling, lookup, knowledge and handoff — no CRM admin tools. */
const CUSTOMER_CHANNEL_TOOLS = [
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "create_booking",
  "cancel_booking",
  "reschedule_booking",
  "search_bookings",
  "booking_search",
  "search_customer",
  "create_customer",
  "check_in",
  "check_out",
  "knowledge_search",
  "escalate_to_human",
  "queue_handoff",
  "transfer_to_workflow",
  "return_to_ai",
];

const WITHOUT_HANDOFF = CUSTOMER_CHANNEL_TOOLS.filter(
  (key) => key !== "escalate_to_human" && key !== "queue_handoff",
);

const COMPANY_FACTS = [
  "ساعات الدعم: من السبت إلى الخميس، 10 صباحاً حتى11 مساءً.",
  "موبايل الدعم: 1999",
].join("\n");

const CTX = { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true };

function reply(text: string, extra: Partial<RuntimeGatewayChatResponse> = {}): RuntimeGatewayChatResponse {
  return {
    text,
    model: "mock-gpt",
    providerKey: "mock",
    finishReason: "stop",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    latencyMs: 1,
    ...extra,
  };
}

function request(conversationId: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  return {
    messages,
    providerKey: "mock",
    model: "mock-gpt",
    context: { companyId: "company-1", conversationId, userId: "user-1" },
  };
}

function llmTools(keys: string[]) {
  return keys.map((name) => ({ type: "function", function: { name } }));
}

describe("AI Flow customer channel", () => {
  it("complaint with ticket tools and handoff disabled is answered honestly without offering a transfer", async () => {
    const routed: string[] = [];
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("complaint without ticket tools must not reach the LLM");
        },
      },
      tools: {
        allowedToolKeys: () => WITHOUT_HANDOFF,
        route: async (_ctx, input) => {
          routed.push(input.toolKey);
          throw new Error("complaint without ticket tools must not call any tool");
        },
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-complaint-no-handoff",
      gatewayRequest: request("conv-complaint-no-handoff", [
        { role: "system", content: COMPANY_FACTS },
        { role: "user", content: "عايز اقدم شكوى على الدكتور" },
      ]),
      tools: llmTools(WITHOUT_HANDOFF),
      allowedToolKeys: WITHOUT_HANDOFF,
    });
    assert.match(result.response.text, /تسجيل الشكاوى مش متاح/);
    assert.doesNotMatch(result.response.text, /خدمة العملاء|تحويل/);
    assert.doesNotMatch(result.response.text, /تم تسجيل|هسجل|سأقوم/);
    assert.deepEqual(routed, []);
  });

  it("complaint with handoff enabled offers customer service and never files a ticket", async () => {
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("complaint without ticket tools must not reach the LLM");
        },
      },
      tools: {
        allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
        route: async () => {
          throw new Error("complaint without ticket tools must not call any tool");
        },
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-complaint-handoff",
      gatewayRequest: request("conv-complaint-handoff", [
        { role: "system", content: COMPANY_FACTS },
        { role: "user", content: "عندي شكوى" },
      ]),
      tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
      allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
    });
    assert.match(result.response.text, /تسجيل الشكاوى مش متاح/);
    assert.match(result.response.text, /خدمة العملاء/);
    assert.equal(result.toolExecutions.length, 0);
  });

  it("customer-service request transfers only within support hours when escalate_to_human is enabled", async () => {
    const routed: string[] = [];
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("a customer-service request must not reach the LLM");
        },
      },
      tools: {
        allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
        route: async (_ctx, input) => {
          routed.push(input.toolKey);
          return {
            toolKey: input.toolKey,
            executionId: "exec-handoff",
            status: "succeeded",
            output: { success: true, assigned: false },
            durationMs: 1,
          };
        },
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-human",
      gatewayRequest: request("conv-human", [
        { role: "system", content: COMPANY_FACTS },
        { role: "user", content: "عايز أكلم خدمة العملاء" },
      ]),
      tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
      allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
    });
    if (supportHoursAreOpen(COMPANY_FACTS)) {
      assert.deepEqual(routed, ["escalate_to_human"]);
      assert.match(result.response.text, /الانتظار|مشغولين/);
    } else {
      assert.deepEqual(routed, []);
      assert.match(result.response.text, /من السبت إلى الخميس/);
    }
  });

  it("customer-service request with handoff disabled never claims a transfer", async () => {
    const routed: string[] = [];
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("a customer-service request must not reach the LLM");
        },
      },
      tools: {
        allowedToolKeys: () => WITHOUT_HANDOFF,
        route: async (_ctx, input) => {
          routed.push(input.toolKey);
          throw new Error("no handoff tool is enabled");
        },
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-human-off",
      gatewayRequest: request("conv-human-off", [
        { role: "system", content: COMPANY_FACTS },
        { role: "user", content: "حولني لخدمة العملاء" },
      ]),
      tools: llmTools(WITHOUT_HANDOFF),
      allowedToolKeys: WITHOUT_HANDOFF,
    });
    assert.deepEqual(routed, []);
    assert.doesNotMatch(result.response.text, /جاري تحويلك/);
  });

  it("update or merge customer requests cannot reach CRM admin tools on the customer channel", async () => {
    const routed: string[] = [];
    const offered: string[][] = [];
    let calls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        calls += 1;
        offered.push((input.tools ?? []).map((tool) => tool.function?.name ?? "").filter(Boolean));
        if (calls === 1) {
          return reply("", {
            finishReason: "tool_calls",
            toolCalls: [
              {
                id: "call-update",
                name: "update_customer",
                arguments: { customerId: "11111111-1111-4111-8111-111111111111", field: "phone", value: "+201000000000" },
              },
              {
                id: "call-merge",
                name: "merge_customers",
                arguments: {
                  primaryCustomerId: "11111111-1111-4111-8111-111111111111",
                  duplicateCustomerIds: ["22222222-2222-4222-8222-222222222222"],
                  confirmed: true,
                },
              },
            ],
          });
        }
        return reply("تعديل أو دمج بيانات العملاء مش متاح من هنا، ممكن أحوّلك لخدمة العملاء.");
      },
    };
    const loop = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
        route: async (_ctx, input) => {
          routed.push(input.toolKey);
          throw new Error(`${input.toolKey} must not be routed`);
        },
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-crm-admin",
      gatewayRequest: request("conv-crm-admin", [
        { role: "user", content: "غيّر رقم موبايلي في السيستم وادمج حسابي مع حساب أخويا" },
      ]),
      tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
      allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
    });
    assert.deepEqual(routed, []);
    for (const names of offered) {
      assert.equal(names.includes("update_customer"), false);
      assert.equal(names.includes("merge_customers"), false);
    }
    assert.doesNotMatch(result.response.text, /تم (?:تعديل|تحديث|دمج)/);
  });

  it("greeting or thanks only does not call tools or replay earlier slots", async () => {
    for (const phrase of ["السلام عليكم", "شكرا"]) {
      const routed: string[] = [];
      const loop = new ToolCallLoopService({
        gateway: {
          async chatCompletion() {
            return reply("العفو، تحت أمرك في أي وقت.");
          },
        },
        tools: {
          allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
          route: async (_ctx, input) => {
            routed.push(input.toolKey);
            throw new Error("greeting must not call tools");
          },
        },
      });
      const result = await loop.run({
        ctx: CTX,
        conversationId: `conv-greeting-${phrase}`,
        priorSchedulingToolExecutions: [
          {
            toolKey: "search_availability",
            executionId: "prior-availability",
            status: "succeeded",
            input: {},
            output: { success: true, message: "المواعيد المتاحة:\n• 09:00 مساءً" },
            durationMs: 0,
          },
        ],
        gatewayRequest: request(`conv-greeting-${phrase}`, [{ role: "user", content: phrase }]),
        tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
        allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
      });
      assert.deepEqual(routed, [], phrase);
      assert.doesNotMatch(result.response.text, /المواعيد المتاحة|09:00/, phrase);
    }
  });

  it("never confirms a cancellation when cancel_booking failed", async () => {
    let calls = 0;
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          calls += 1;
          if (calls === 1) {
            return reply("", {
              finishReason: "tool_calls",
              toolCalls: [{ id: "call-cancel", name: "cancel_booking", arguments: { bookingReference: "BK-000090" } }],
            });
          }
          return reply("تم إلغاء الحجز BK-000090 بنجاح.");
        },
      },
      tools: {
        allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
        route: async (_ctx, input) => ({
          toolKey: input.toolKey,
          executionId: "exec-cancel-failed",
          status: "failed",
          output: { success: false, errorCode: "BOOKING_NOT_CANCELLABLE" },
          durationMs: 1,
        }),
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-cancel-failed",
      gatewayRequest: request("conv-cancel-failed", [{ role: "user", content: "الغي الحجز BK-000090" }]),
      tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
      allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
    });
    assert.doesNotMatch(result.response.text, /تم إلغاء/);
  });

  it("never confirms a reschedule when reschedule_booking failed without a customer message", async () => {
    let calls = 0;
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          calls += 1;
          if (calls === 1) {
            return reply("", {
              finishReason: "tool_calls",
              toolCalls: [
                {
                  id: "call-reschedule",
                  name: "reschedule_booking",
                  arguments: { bookingReference: "BK-000090", date: "2026-10-20", time: "19:00" },
                },
              ],
            });
          }
          return reply("تم تغيير موعدك بنجاح إلى يوم 20 أكتوبر الساعة 7 مساءً.");
        },
      },
      tools: {
        allowedToolKeys: () => CUSTOMER_CHANNEL_TOOLS,
        route: async (_ctx, input) => ({
          toolKey: input.toolKey,
          executionId: "exec-reschedule-failed",
          status: "failed",
          output: { success: false, errorCode: "SLOT_UNAVAILABLE" },
          durationMs: 1,
        }),
      },
    });
    const result = await loop.run({
      ctx: CTX,
      conversationId: "conv-reschedule-failed",
      gatewayRequest: request("conv-reschedule-failed", [
        { role: "user", content: "عايز اغير معاد الحجز BK-000090 ليوم 20-10-2026 الساعة 7 مساء رقمي 01011404109" },
      ]),
      tools: llmTools(CUSTOMER_CHANNEL_TOOLS),
      allowedToolKeys: CUSTOMER_CHANNEL_TOOLS,
    });
    assert.doesNotMatch(result.response.text, /تم (?:تغيير|تعديل|نقل)/);
  });
});
