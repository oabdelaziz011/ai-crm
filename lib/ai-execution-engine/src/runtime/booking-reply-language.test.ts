import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";
import { ToolCallLoopService } from "./tool-call-loop-service.js";

const CLINIC_ID = "11111111-1111-4111-8111-111111111111";
const DENTAL_ID = "22222222-2222-4222-8222-222222222222";
const NEAREST_CATALOG = `- Clinic: serviceId=${CLINIC_ID}`;
const CATALOG = [
  NEAREST_CATALOG,
  `- Dental: serviceId=${DENTAL_ID}`,
  "- service=Clinic kind=New label=New amount=200 currency=EGP",
  "- service=Clinic kind=Consultation label=Consultation amount=5 currency=USD",
].join("\n");

function tools(routed: string[]): RuntimeToolPort {
  return {
    async route(_ctx, input) {
      routed.push(input.toolKey);
      return {
        executionId: "exec-1",
        toolKey: input.toolKey,
        status: "succeeded",
        output: {
          success: true,
          slot: { date: "2026-08-26", start: "10:00", resourceName: "Dr. Ada" },
          customerFacingMessage: "أقرب موعد متاح: يوم 2026-08-26 الساعة 10:00 مع Dr. Ada.",
          resources: [
            {
              resourceId: "resource-1",
              resourceName: "Dr. Ada",
              slots: [{ date: "2026-08-26", start: "10:00", end: "10:30" }],
            },
          ],
        },
        durationMs: 1,
      };
    },
    listLlmTools() {
      return [
        { type: "function", function: { name: "find_next_available", description: "Nearest", parameters: { type: "object", properties: {} } } },
        { type: "function", function: { name: "search_availability", description: "List", parameters: { type: "object", properties: {} } } },
      ];
    },
    allowedToolKeys() {
      return ["find_next_available", "search_availability"];
    },
  };
}

function gateway(): RuntimeGatewayPort {
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

async function ask(content: string | Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  const routed: string[] = [];
  const port = tools(routed);
  const loop = new ToolCallLoopService({ gateway: gateway(), tools: port });
  const messages = typeof content === "string" ? [{ role: "user" as const, content }] : content;
  const result = await loop.run({
    ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
    conversationId: "conv-1",
    gatewayRequest: { messages, model: "mock" },
    tools: port.listLlmTools(),
    allowedToolKeys: port.allowedToolKeys(),
  });
  return { text: result.response.text, routed };
}

describe("nearest appointment and booking prompts follow the customer language", () => {
  it("answers a nearest-slot question in English from the returned slot only", async () => {
    const { text, routed } = await ask([
      { role: "system", content: NEAREST_CATALOG },
      { role: "user", content: "What is the next available time for Clinic?" },
    ]);
    assert.deepEqual(routed, ["find_next_available"]);
    assert.match(text, /Next open time: 2026-08-26 at 10:00 with Dr\. Ada/);
    assert.equal(text.includes("أقرب موعد"), false);
    assert.equal(text.includes("Open times"), false);
  });

  it("answers a nearest-slot question in German and does not list the whole day", async () => {
    const { text, routed } = await ask([
      { role: "system", content: NEAREST_CATALOG },
      { role: "user", content: "Was ist der nächste freie Termin für Clinic?" },
    ]);
    assert.deepEqual(routed, ["find_next_available"]);
    assert.match(text, /Nächster freier Termin: 2026-08-26 um 10:00 bei Dr\. Ada/);
    assert.equal(text.includes("Freie Termine"), false);
  });

  it("keeps an Arabic nearest request on find_next_available", async () => {
    const { text, routed } = await ask([
      { role: "system", content: NEAREST_CATALOG },
      { role: "user", content: "إيه أقرب موعد لـ Clinic؟" },
    ]);
    assert.deepEqual(routed, ["find_next_available"]);
    assert.match(text, /أقرب موعد/);
    assert.equal(text.includes("Open times"), false);
  });

  it("still lists open times when the customer asks which times are open", async () => {
    const { text, routed } = await ask([
      { role: "system", content: CATALOG },
      { role: "user", content: "What times are open tomorrow for Clinic?" },
    ]);
    assert.deepEqual(routed, ["search_availability"]);
    assert.match(text, /Open times for Clinic/);
    assert.equal(text.includes("Next open time"), false);
  });

  it("asks for the service and visit type in the customer's language", async () => {
    const english = await ask([
      { role: "system", content: CATALOG },
      { role: "assistant", content: "Would you like to book an appointment?" },
      { role: "user", content: "yes" },
    ]);
    assert.deepEqual(english.routed, []);
    assert.match(english.text, /Which service would you like to book\?/);
    assert.match(english.text, /Clinic/);

    const picked = await ask([
      { role: "system", content: CATALOG },
      { role: "user", content: "I want to book an appointment" },
      { role: "assistant", content: "Which service would you like to book?\n- Clinic\n- Dental" },
      { role: "user", content: "Clinic" },
    ]);
    assert.match(picked.text, /Which visit type do you want\? for Clinic/);
    assert.match(picked.text, /New/);
    assert.match(picked.text, /Consultation/);

    const german = await ask([
      { role: "system", content: CATALOG },
      { role: "user", content: "Ich möchte einen Termin buchen" },
    ]);
    assert.match(german.text, /Welche Leistung möchten Sie buchen\?/);
    assert.equal(german.text.includes("تحب تحجز"), false);
  });

  it("asks for the customer name and mobile in English after a chosen time", async () => {
    const { text } = await ask([
      { role: "system", content: NEAREST_CATALOG },
      { role: "user", content: "I want to book an appointment on 2026-08-26 at 10:00" },
    ]);
    assert.match(text, /full name and mobile number/i);
    assert.equal(text.includes("اسم العميل"), false);
  });

  it("asks for the customer name in German and does not switch for Müller or OK", async () => {
    const germanName = await ask([
      { role: "user", content: "Ich möchte einen Termin buchen am 2026-08-26 um 10:00" },
    ]);
    assert.match(germanName.text, /Namen des Kunden|vollständigen Namen/i);
    assert.equal(germanName.text.includes("اسم العميل"), false);

    const named = await ask([
      { role: "system", content: NEAREST_CATALOG },
      { role: "user", content: "Müller GmbH" },
      { role: "user", content: "Was ist der nächste freie Termin?" },
    ]);
    assert.deepEqual(named.routed, ["find_next_available"]);
    assert.match(named.text, /Nächster freier Termin/);

    const afterOk = await ask([
      { role: "user", content: "Welche Termine sind morgen frei?" },
      { role: "user", content: "OK" },
    ]);
    assert.equal(afterOk.text.includes("اسم الخدمة"), false);
    assert.equal(afterOk.text.includes("Which service"), false);
  });
});
