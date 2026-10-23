import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuntimeGatewayPort, RuntimeToolPort } from "../ports/runtime-ports.js";
import {
  companyContactKind,
  companyContactReply,
  customerContinuesHumanWait,
  customerWantsHumanAgent,
  humanSupportClosedReply,
  supportHoursAreOpen,
  ToolCallLoopService,
} from "./tool-call-loop-service.js";

const FACTS = `ساعات الدعم: من السبت إلى الخميس، 10 صباحاً حتى 6 مساءً.
اللوكيشن: https://www.google.com/maps/search/?api=1&query=Commercial+Registry+28+Ramses+Street+Cairo
العنوان: القاهره الدقي 123 شارع العزيز بالله
موبايل الدعم: 1999
CHANNEL SENDER:
- WhatsApp phone: +201011404109`;

describe("company contact replies", () => {
  it("sends the maps link alone when the customer asks for the location", () => {
    assert.equal(companyContactKind("ممكن لوكيشن المكان ؟"), "location");
    const reply = companyContactReply([
      { role: "system", content: FACTS },
      { role: "user", content: "ممكن لوكيشن المكان ؟" },
    ]);
    assert.equal(
      reply,
      "اللوكيشن:\nhttps://www.google.com/maps/search/?api=1&query=Commercial+Registry+28+Ramses+Street+Cairo",
    );
  });

  it("does not answer the support phone when the customer is giving their own number to buy", () => {
    const purchase =
      "عايز أشتري منتج عيادة. اسمي سارة اختبار. الإيميل sara.e2e.lifecycle@example.test والموبايل 01000000991. الميزانية 5000 جنيه.";
    assert.equal(companyContactKind(purchase), null);
    assert.equal(
      companyContactReply([
        { role: "system", content: FACTS },
        { role: "user", content: purchase },
      ]),
      null,
    );
    assert.equal(companyContactKind("ممكن رقم التليفون"), "phone");
  });

  it("answers the support phone and does not reuse the WhatsApp sender number", () => {
    assert.equal(companyContactKind("ممكن رقم التليفون"), "phone");
    const reply = companyContactReply([
      { role: "system", content: FACTS },
      { role: "user", content: "ممكن رقم التليفون" },
    ]);
    assert.equal(reply, "رقم التليفون: 1999");
  });

  it("answers the address and keeps the maps link on the next line", () => {
    assert.equal(companyContactKind("ممكن العنوان"), "address");
    const reply = companyContactReply([
      { role: "system", content: FACTS },
      { role: "user", content: "ممكن العنوان" },
    ]);
    assert.equal(
      reply,
      "العنوان: القاهره الدقي 123 شارع العزيز بالله\nhttps://www.google.com/maps/search/?api=1&query=Commercial+Registry+28+Ramses+Street+Cairo",
    );
  });

  it("treats a customer-service request as support, not a booking", () => {
    assert.equal(customerWantsHumanAgent("هل ممكن اتكلم مع خدمه العملاء ؟"), true);
    assert.equal(customerWantsHumanAgent("يا عم حولني"), true);
    assert.equal(customerWantsHumanAgent("عايز المدير"), true);
    assert.equal(customerWantsHumanAgent("حولي لخدمه العملاء"), true);
    assert.equal(customerWantsHumanAgent("حول الموعد"), false);
    assert.equal(customerWantsHumanAgent("أقرب موعد"), false);
    assert.equal(
      customerContinuesHumanWait("فين التحويل", [
        { role: "user", content: "يا عم حولني" },
        {
          role: "assistant",
          content:
            "نعتذر لحضرتك، جميع موظفي خدمة العملاء مشغولون حاليًا. تم تسجيل طلبك، وسيقوم أحد موظفينا بالتواصل معك في أقرب وقت ممكن. برجاء الانتظار، وشكرًا لتفهمك.",
        },
        { role: "user", content: "فين التحويل" },
      ]),
      true,
    );
    assert.equal(
      customerContinuesHumanWait("عايز أقرب موعد", [
        { role: "user", content: "يا عم حولني" },
        { role: "user", content: "عايز أقرب موعد" },
      ]),
      false,
    );
    assert.equal(customerContinuesHumanWait("فين", [{ role: "user", content: "فين" }]), false);
    const reply = humanSupportClosedReply([
      { role: "system", content: FACTS },
      { role: "user", content: "هل ممكن اتكلم مع خدمه العملاء ؟" },
    ]);
    assert.match(reply, /من السبت إلى الخميس/);
    assert.match(reply, /محوّلتش المحادثة/);
    assert.equal(reply.includes("1999"), false);
    const english = humanSupportClosedReply([
      { role: "system", content: FACTS },
      { role: "user", content: "I want to talk to a human." },
    ]);
    assert.match(english, /Customer support is available/);
    assert.match(english, /I did not transfer this chat/);
    assert.match(english, /من السبت إلى الخميس/);
  });

  it("keeps support hours closed at night and on Friday in Cairo", () => {
    assert.equal(supportHoursAreOpen(FACTS, new Date("2026-10-13T00:11:00Z")), false);
    assert.equal(supportHoursAreOpen(FACTS, new Date("2026-10-13T08:00:00Z")), true);
    assert.equal(supportHoursAreOpen(FACTS, new Date("2026-10-16T08:00:00Z")), false);
  });

  it("does not say a handoff was registered when escalate_to_human throws", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("the model must not run after a handoff failure");
      },
    };
    const tools: RuntimeToolPort = {
      allowedToolKeys: () => ["escalate_to_human"],
      async route() {
        throw new Error("handoff adapter unavailable");
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-handoff",
      gatewayRequest: {
        messages: [{ role: "user", content: "حولني لموظف" }],
        model: "mock",
      },
      tools: [],
      allowedToolKeys: ["escalate_to_human"],
    });
    assert.match(result.response.text, /متسجلش/);
    assert.equal(result.response.text.includes("تم تسجيل طلبك"), false);
    assert.equal(result.toolExecutions.length, 0);
  });

  it("registers a handoff only when support hours are open and the tool assigns an owner", async () => {
    const open = new Date("2026-10-13T08:00:00Z");
    const closed = new Date("2026-10-13T00:11:00Z");
    assert.equal(supportHoursAreOpen(FACTS, open), true);
    assert.equal(supportHoursAreOpen(FACTS, closed), false);

    const routed: string[] = [];
    const tools: RuntimeToolPort = {
      allowedToolKeys: () => ["escalate_to_human"],
      async route() {
        routed.push("escalate_to_human");
        return {
          executionId: "handoff-1",
          toolKey: "escalate_to_human",
          status: "succeeded",
          output: { success: true, assigned: true, handoffRequestId: "handoff-row-1" },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("an open-hours handoff must not reach the model");
        },
      },
      tools,
    });
    const succeeded = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-handoff-open",
      now: open,
      gatewayRequest: {
        messages: [
          { role: "system", content: FACTS },
          { role: "user", content: "حولني لموظف" },
        ],
        model: "mock",
      },
      tools: [],
      allowedToolKeys: ["escalate_to_human"],
    });
    assert.deepEqual(routed, ["escalate_to_human"]);
    assert.match(succeeded.response.text, /جاري تحويلك/);
    assert.equal(succeeded.response.usage?.outputTokens ?? 0, 0);
    assert.equal(succeeded.toolExecutions[0]?.output?.handoffRequestId, "handoff-row-1");

    const failedLoop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("a failed handoff must not reach the model");
        },
      },
      tools: {
        allowedToolKeys: () => ["escalate_to_human"],
        async route() {
          return {
            executionId: "handoff-2",
            toolKey: "escalate_to_human",
            status: "succeeded",
            output: { success: false, assigned: false },
            durationMs: 1,
          };
        },
      },
    });
    const failed = await failedLoop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-handoff-failed",
      now: open,
      gatewayRequest: {
        messages: [
          { role: "system", content: FACTS },
          { role: "user", content: "I want to talk to a human." },
        ],
        model: "mock",
      },
      tools: [],
      allowedToolKeys: ["escalate_to_human"],
    });
    assert.match(failed.response.text, /was not registered/);
    assert.equal(failed.response.text.includes("تم تسجيل طلبك"), false);

    const closedLoop = new ToolCallLoopService({
      gateway: {
        async chatCompletion() {
          throw new Error("closed hours must not reach the model");
        },
      },
      tools: {
        allowedToolKeys: () => ["escalate_to_human"],
        async route() {
          throw new Error("closed hours must not call escalate_to_human");
        },
      },
    });
    const refused = await closedLoop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-handoff-closed",
      now: closed,
      gatewayRequest: {
        messages: [
          { role: "system", content: FACTS },
          { role: "user", content: "حولني لموظف" },
        ],
        model: "mock",
      },
      tools: [],
      allowedToolKeys: ["escalate_to_human"],
    });
    assert.match(refused.response.text, /محوّلتش المحادثة/);
    assert.equal(refused.response.text.includes("تم تسجيل طلبك"), false);
    assert.equal(refused.toolExecutions.length, 0);
  });
});
