import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeGatewayChatRequest, RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";
import { ToolCallLoopService } from "./tool-call-loop-service.js";

const SERVICE_LINE = "- Clinic: serviceId=11111111-1111-4111-8111-111111111111";
const SLOT_TIME = "09:00";

function availabilityTools(routed: Array<{ key: string; serviceId: string }>): RuntimeToolPort {
  return {
    async route(_ctx, input) {
      const serviceId = String((input.input as { serviceId?: unknown }).serviceId ?? "");
      routed.push({ key: input.toolKey, serviceId });
      return {
        executionId: "exec-1",
        toolKey: input.toolKey,
        status: "succeeded",
        output: {
          success: true,
          resources: [
            {
              resourceId: "resource-1",
              resourceName: "Dr. Ada",
              slots: [{ date: "2026-08-01", start: "09:00", end: "09:30" }],
            },
          ],
        },
        durationMs: 1,
      };
    },
    listLlmTools() {
      return [
        {
          type: "function",
          function: {
            name: "search_availability",
            description: "Search availability",
            parameters: { type: "object", properties: { serviceId: { type: "string" } } },
          },
        },
      ];
    },
    allowedToolKeys() {
      return ["search_availability"];
    },
  };
}

function gateway(assistantText: string): RuntimeGatewayPort {
  return {
    async chatCompletion() {
      return {
        text: assistantText,
        model: "mock",
        providerKey: "mock",
        finishReason: assistantText ? "stop" : "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      };
    },
  };
}

async function ask(messages: RuntimeGatewayChatRequest["messages"], assistantText = "Noted.") {
  const routed: Array<{ key: string; serviceId: string }> = [];
  const tools = availabilityTools(routed);
  const loop = new ToolCallLoopService({ gateway: gateway(assistantText), tools });
  const result = await loop.run({
    ctx: {
      userId: "user-1",
      companyId: "company-1",
      isSuperAdmin: false,
      hasPermission: () => true,
    },
    conversationId: "conv-1",
    gatewayRequest: { messages, model: "mock" },
    tools: tools.listLlmTools(),
    allowedToolKeys: tools.allowedToolKeys(),
  });
  return { text: result.response.text, routed };
}

describe("availability questions and reply language", () => {
  it("asks for the service in English when the customer asks which times are open", async () => {
    const { text, routed } = await ask([{ role: "user", content: "What times are open tomorrow?" }]);
    assert.deepEqual(routed, []);
    assert.match(text, /Which service/);
    assert.equal(text.includes(SLOT_TIME), false);
  });

  it("asks for the service in English for a specific morning time", async () => {
    const { text, routed } = await ask([{ role: "user", content: "Is 10 AM available tomorrow?" }]);
    assert.deepEqual(routed, []);
    assert.match(text, /Which service/);
  });

  it("searches the known service once and answers in English", async () => {
    const { text, routed } = await ask([
      { role: "assistant", content: SERVICE_LINE },
      { role: "user", content: "What times are open tomorrow for Clinic?" },
    ]);
    assert.deepEqual(routed, [{ key: "search_availability", serviceId: "11111111-1111-4111-8111-111111111111" }]);
    assert.match(text, /Open times for Clinic/);
    assert.match(text, new RegExp(SLOT_TIME));
    assert.equal(text.includes("المواعيد المتاحة"), false);
  });

  it("asks for the service in Arabic", async () => {
    const unknown = await ask([{ role: "user", content: "ايه المواعيد المتاحة بكرة؟" }]);
    assert.deepEqual(unknown.routed, []);
    assert.match(unknown.text, /اسم الخدمة/);

    const clock = await ask([{ role: "user", content: "في معاد الساعة ١٠ بكرة؟" }]);
    assert.deepEqual(clock.routed, []);
    assert.match(clock.text, /اسم الخدمة/);
  });

  it("keeps a known Arabic service and does not ask for it again", async () => {
    const { text, routed } = await ask([
      { role: "assistant", content: SERVICE_LINE },
      { role: "user", content: "الأوقات المتاحة بكرة لـ Clinic؟" },
    ]);
    assert.equal(routed.length, 1);
    assert.equal(routed[0]?.key, "search_availability");
    assert.match(text, /أيام المواعيد المتاحة لـClinic|Clinic/);
    assert.equal(text.includes("اسم الخدمة"), false);
  });

  it("asks for the service in German and switches when the customer changes language", async () => {
    const german = await ask([{ role: "user", content: "Welche Termine sind morgen frei?" }]);
    assert.deepEqual(german.routed, []);
    assert.match(german.text, /welche Leistung/i);

    const clock = await ask([{ role: "user", content: "Ist morgen um 10 Uhr ein Termin frei?" }]);
    assert.match(clock.text, /welche Leistung/i);

    const switched = await ask([
      { role: "user", content: "عايز أعرف المواعيد" },
      { role: "user", content: "Welche Termine sind morgen frei?" },
    ]);
    assert.match(switched.text, /welche Leistung/i);
    assert.equal(switched.text.includes("اسم الخدمة"), false);
  });

  it("searches once for a known German service", async () => {
    const { text, routed } = await ask([
      { role: "assistant", content: SERVICE_LINE },
      { role: "user", content: "Welche Termine sind morgen frei für Clinic?" },
    ]);
    assert.equal(routed.length, 1);
    assert.match(text, /Freie Termine für Clinic/);
    assert.match(text, new RegExp(SLOT_TIME));
  });

  it("does not replace a name or an unrelated open/available sentence with a slot list", async () => {
    const kept = "Noted.";
    for (const content of [
      "Ahmed Ali",
      "Ahmed Ali?",
      "أحمد علي",
      "The front desk is open from 9 to 5.",
      "Is this role available?",
      "Is the Sonic headphone available?",
      "Müller GmbH",
    ]) {
      const { text, routed } = await ask([{ role: "user", content }], kept);
      assert.deepEqual(routed, [], content);
      assert.equal(text, kept, content);
    }
  });

  it("keeps English after a short follow-up that does not name a language", async () => {
    const { text } = await ask([
      { role: "user", content: "What times are open tomorrow?" },
      { role: "assistant", content: "Which service should I check open times for?" },
      { role: "user", content: "ok" },
    ]);
    assert.match(text, /Which service|Open times|Noted/);
    assert.equal(text.includes("اسم الخدمة"), false);
  });
});
