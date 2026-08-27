import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";

function cairoCalendarYmd(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (offsetDays === 0) return today;
  const [year, month, day] = today.split("-").map((part) => Number(part));
  const utc = new Date(Date.UTC(year!, month! - 1, day! + offsetDays));
  return utc.toISOString().slice(0, 10);
}

function cairoJsWeekday(isoDate: string): number | null {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
  }).format(new Date(`${isoDate}T12:00:00Z`));
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[label] ?? null;
}

function nextCairoYmdForWeekday(targetWeekday: number): string {
  for (let offset = 0; offset <= 7; offset += 1) {
    const ymd = cairoCalendarYmd(offset);
    if (cairoJsWeekday(ymd) === targetWeekday) return ymd;
  }
  throw new Error(`no Cairo weekday ${targetWeekday} within 7 days`);
}

/** Africa/Cairo next (or today) Wednesday — used by relative "الأربعاء" binding. */
const NEXT_CAIRO_WEDNESDAY = nextCairoYmdForWeekday(3);

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

  it("returns search_availability summary when the model replies with a placeholder", async () => {
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
                  name: "search_availability",
                  arguments: { serviceId: "svc-1", resourceId: "res-1" },
                },
              ],
            };
          }

          return {
            text: "سأتحقق من المواعيد المتاحة الآن. لحظة من فضلك.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
            latencyMs: 7,
          };
        }

        throw new Error("Unexpected completion without tools");
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_availability"],
      route: async () => ({
        toolKey: "search_availability",
        executionId: "exec-availability-1",
        status: "succeeded",
        output: {
          success: true,
          customerSummary: "المواعيد المتاحة مع ADAM:\n- 2026-08-20: 07:00, 07:15",
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "عايزة احجز مع دكتور Adam" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_availability" } }],
      allowedToolKeys: ["search_availability"],
    });

    assert.match(result.response.text, /المواعيد المتاحة مع ADAM/);
    assert.match(result.response.text, /07:00/);
    assert.doesNotMatch(result.response.text, /لحظة من فضلك/);
  });

  it("replaces a same-day-only reply when search_availability found multiple dates", async () => {
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
                  name: "search_availability",
                  arguments: { serviceId: "svc-1", resourceId: "res-1" },
                },
              ],
            };
          }

          return {
            text: "المواعيد المتاحة مع ADAM:\n- 2026-08-20: 07:00, 07:15",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
            latencyMs: 7,
          };
        }

        throw new Error("Unexpected completion without tools");
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_availability"],
      route: async () => ({
        toolKey: "search_availability",
        executionId: "exec-availability-2",
        status: "succeeded",
        output: {
          success: true,
          customerSummary:
            "المواعيد المتاحة مع ADAM:\n- 2026-08-20: 07:00, 07:15\n- 2026-08-21: 07:00, 07:15\n- 2026-08-22: 07:00, 07:15",
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "عايزة احجز مع دكتور Adam" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_availability" } }],
      allowedToolKeys: ["search_availability"],
    });

    assert.match(result.response.text, /2026-08-21/);
    assert.match(result.response.text, /2026-08-22/);
  });

  it("replaces a checking-availability placeholder even when it mentions a clock time", async () => {
    let completionCalls = 0;

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        completionCalls += 1;
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
                name: "search_availability",
                arguments: { serviceId: "svc-1", resourceId: "res-1", date: "2026-08-26" },
              },
            ],
          };
        }
        throw new Error("Should not make a second model call after availability is found");
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_availability"],
      route: async () => ({
        toolKey: "search_availability",
        executionId: "exec-availability-3",
        status: "succeeded",
        output: {
          success: true,
          customerSummary: "المواعيد المتاحة مع ADAM:\n- 2026-08-26: 21:00, 21:15, 21:30, 21:45",
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "المفروض اني اخترت الميعاد 21:30" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_availability" } }],
      allowedToolKeys: ["search_availability"],
    });

    assert.equal(completionCalls, 1);
    assert.equal(result.toolExecutions.length, 1);
    assert.match(result.response.text, /21:00/);
    assert.match(result.response.text, /21:30/);
    assert.doesNotMatch(result.response.text, /لحظة/);
  });

  it("asks for patient name and age when the model promises to book without create_booking", async () => {
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
                  id: "call-search-customer",
                  name: "search_customer",
                  arguments: { query: "201023169075" },
                },
              ],
            };
          }

          return {
            text: "حسناً، سأقوم بحجز موعد مع الدكتور ADAM يوم 2026-08-23 الساعة 19:00. يرجى الانتظار قليلاً.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
            latencyMs: 7,
          };
        }

        throw new Error("Unexpected completion without tools");
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => ({
        toolKey: input.toolKey,
        executionId: "exec-search-customer-1",
        status: "succeeded",
        output: { success: true, total: 0, customers: [] },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "يوم 23-08-2026 الساعة 19:00" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_customer" } }],
      allowedToolKeys: ["search_customer", "create_booking"],
    });

    assert.match(result.response.text, /اسم المريض|رقم موبايل/);
    assert.doesNotMatch(result.response.text, /سأقوم بحجز/);
    assert.doesNotMatch(result.response.text, /يرجى الانتظار/);
  });

  it("does not ask for name and age again after create_customer returned a customer UUID", async () => {
    let completionCalls = 0;
    const routedCustomerIds: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        completionCalls += 1;
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
                id: "call-create-customer",
                name: "create_customer",
                arguments: { name: "نسمة حسام", phone: "201023169075" },
              },
            ],
          };
        }
        if (completionCalls === 2) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
            latencyMs: 5,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "نسمة حسام",
                  serviceId: "svc-1",
                  resourceId: "res-1",
                  date: "2026-08-26",
                  slotStart: "21:15",
                },
              },
            ],
          };
        }
        return {
          text: "محتاجين اسم المريض عشان نكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 7,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "create_customer") {
          return {
            toolKey: "create_customer",
            executionId: "exec-create-customer-1",
            status: "succeeded",
            output: {
              success: true,
              customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
            },
            durationMs: 1,
          };
        }
        routedCustomerIds.push(String(input.input.customerId ?? ""));
        return {
          toolKey: "create_booking",
          executionId: "exec-create-booking-1",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
            bookingRef: "1E6E345E",
            date: "2026-08-26",
            slotStart: "21:15",
            startAt: "2026-08-26T18:15:00+00:00",
            customerFacingMessage:
              "تم حجز موعدك بنجاح.\nالموعد: يوم 26-08-2026 الساعة 21:15\nرقم الحجز: 1E6E345E",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "26-08-2026\n21:15" },
          { role: "user", content: "نسمة حسام\n28\n201023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.deepEqual(routedCustomerIds, ["1e6e345e-5180-46fc-9f2b-01f832a6a432"]);
    assert.match(result.response.text, /تم حجز موعدك بنجاح/);
    assert.match(result.response.text, /يوم 26-08-2026 الساعة 21:15/);
    assert.match(result.response.text, /رقم الحجز: 1E6E345E/);
    assert.doesNotMatch(result.response.text, /T18:15:00/);
    assert.doesNotMatch(result.response.text, /اسم المريض والعمر/);
  });

  it("confirms a successful booking even when the model also searched availability again", async () => {
    let completionCalls = 0;

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        completionCalls += 1;
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
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: "svc-1",
                  resourceId: "res-1",
                  date: "2026-08-23",
                  slotStart: "19:00",
                },
              },
              {
                id: "call-search-availability",
                name: "search_availability",
                arguments: { serviceId: "svc-1", resourceId: "res-1", date: "2026-08-23" },
              },
            ],
          };
        }
        return {
          text: "المواعيد المتاحة مع ADAM:\n- 2026-08-23: 19:15, 19:30",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 7,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_booking", "search_availability"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        if (input.toolKey === "create_booking") {
          return {
            toolKey: "create_booking",
            executionId: "exec-booking-ok",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "68d29c17-ad91-4c92-b2b2-08f72cba4873",
              bookingRef: "68D29C17",
              date: "2026-08-23",
              slotStart: "19:00",
              startAt: "2026-08-23T16:00:00+00:00",
              customerFacingMessage:
                "تم حجز موعدك بنجاح.\nالموعد: يوم 23-08-2026 الساعة 19:00\nرقم الحجز: 68D29C17",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: "search_availability",
          executionId: "exec-availability-late",
          status: "succeeded",
          output: {
            success: true,
            customerSummary: "المواعيد المتاحة مع ADAM:\n- 2026-08-23: 19:15, 19:30",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "2026-08-23 19:00" },
          { role: "user", content: "أحمد محمد 01012345678" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: ["create_booking", "search_availability"],
    });

    assert.match(result.response.text, /تم حجز موعدك بنجاح/);
    assert.match(result.response.text, /يوم 23-08-2026 الساعة 19:00/);
    assert.match(result.response.text, /رقم الحجز: 68D29C17/);
    assert.doesNotMatch(result.response.text, /T16:00:00/);
    assert.doesNotMatch(result.response.text, /اختاري الموعد/);
  });

  it("blocks a fake booking confirmation when create_booking did not succeed", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تم حجز موعدك بنجاح مع الدكتور Adam.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
        };
      },
    };

    const loop = new ToolCallLoopService({
      gateway,
      tools: {
        allowedToolKeys: () => ["create_booking"],
        route: async () => {
          throw new Error("should not route");
        },
      },
    });

    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "احجزي 19:00" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking"],
    });

    assert.doesNotMatch(result.response.text, /تم حجز موعدك بنجاح/);
    assert.match(result.response.text, /اسم المريض|رقم موبايل/);
  });

  it("confirms booking when create_booking succeeded but the model still replies with a placeholder", async () => {
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
                  id: "call-create-booking",
                  name: "create_booking",
                  arguments: {
                    customerId: "11111111-1111-4111-8111-111111111111",
                    serviceId: "svc-1",
                    resourceId: "res-1",
                    date: "2026-08-23",
                    slotStart: "19:00",
                  },
                },
              ],
            };
          }

          return {
            text: "سأقوم بحجز موعدك الآن. لحظة من فضلك.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
            latencyMs: 7,
          };
        }

        throw new Error("Unexpected completion without tools");
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_booking"],
      route: async () => ({
        toolKey: "create_booking",
        executionId: "exec-create-booking-1",
        status: "succeeded",
        output: {
          success: true,
          bookingId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          bookingRef: "AAAAAAAA",
          date: "2026-08-23",
          slotStart: "19:00",
          startAt: "2026-08-23T16:00:00+00:00",
          customerFacingMessage:
            "تم حجز موعدك بنجاح.\nالموعد: يوم 23-08-2026 الساعة 19:00\nرقم الحجز: AAAAAAAA",
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "احجز 2026-08-23 19:00" },
          { role: "user", content: "أحمد محمد 01012345678" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking"],
    });

    assert.match(result.response.text, /تم حجز موعدك بنجاح/);
    assert.match(result.response.text, /يوم 23-08-2026 الساعة 19:00/);
    assert.match(result.response.text, /رقم الحجز: AAAAAAAA/);
    assert.doesNotMatch(result.response.text, /T16:00:00/);
  });

  it("skips extra customer lookups and books after a completing-booking placeholder", async () => {
    let completionCalls = 0;
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        completionCalls += 1;
        const lastUser = [...(input.messages ?? [])]
          .reverse()
          .find((message) => message.role === "user");
        const lastText = typeof lastUser?.content === "string" ? lastUser.content : "";

        if (lastText.includes("CRITICAL: customerId=")) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
            latencyMs: 5,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: "svc-1",
                  resourceId: "res-1",
                  date: "2026-08-25",
                  slotStart: "20:45",
                },
              },
            ],
          };
        }

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
                id: "call-create-customer",
                name: "create_customer",
                arguments: { name: "مروة محي", phone: "201023169075" },
              },
            ],
          };
        }

        if (input.tools?.length && completionCalls === 2) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
            latencyMs: 5,
            toolCalls: [
              {
                id: "call-search-customer",
                name: "search_customer",
                arguments: { query: "مروة محي" },
              },
            ],
          };
        }

        return {
          text: "هبدأ الآن في إتمام عملية الحجز لمروة محي. لحظة من فضلك.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 7,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_customer", "search_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        routedKeys.push(input.toolKey);
        if (input.toolKey === "create_customer") {
          return {
            toolKey: "create_customer",
            executionId: "exec-create-customer-2",
            status: "succeeded",
            output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
            durationMs: 1,
          };
        }
        if (input.toolKey === "search_customer") {
          throw new Error("search_customer should be skipped after a customer UUID is resolved");
        }
        return {
          toolKey: "create_booking",
          executionId: "exec-create-booking-forced",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "68d29c17-ad91-4c92-b2b2-08f72cba4873",
            bookingRef: "68D29C17",
            date: "2026-08-25",
            slotStart: "20:45",
            customerFacingMessage:
              "تم حجز موعدك بنجاح.\nالموعد: يوم 25-08-2026 الساعة 20:45\nرقم الحجز: 68D29C17",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة احجز" },
          { role: "user", content: "يوم 25-08-2026\nوقت 20:45" },
          { role: "user", content: "مروة محي\n29\n201023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "search_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "search_customer", "create_booking"],
    });

    assert.deepEqual(routedKeys, ["create_customer", "create_booking"]);
    assert.match(result.response.text, /تم حجز موعدك بنجاح/);
    assert.doesNotMatch(result.response.text, /هبدأ/);
    assert.doesNotMatch(result.response.text, /لحظة من فضلك/);
  });

  it("does not restart availability when the customer sends ؟؟ after name and a picked slot", async () => {
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "سأبحث الآن عن المواعيد المتاحة مع الدكتور ADAM.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
          latencyMs: 5,
          toolCalls: [
            {
              id: "call-search-availability",
              name: "search_availability",
              arguments: { serviceId: "svc-1", resourceId: "res-1" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_availability", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        routedKeys.push(input.toolKey);
        return {
          toolKey: "search_availability",
          executionId: "exec-availability-restart",
          status: "succeeded",
          output: {
            success: true,
            customerSummary: "المواعيد المتاحة مع ADAM:\n- 2026-08-25: 20:45, 21:00",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة احجز" },
          { role: "user", content: "يوم 25-08-2026\nوقت 20:45" },
          { role: "user", content: "مروة محي\n29\n201023169075" },
          { role: "user", content: "؟؟" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_availability" } }],
      allowedToolKeys: ["search_availability", "create_booking"],
    });

    assert.deepEqual(routedKeys, []);
    assert.doesNotMatch(result.response.text, /20:45, 21:00/);
    assert.doesNotMatch(result.response.text, /سأبحث الآن عن المواعيد المتاحة/);
  });

  it("completes the booking when the model only says it will book now", async () => {
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "سأقوم الآن بحجز موعد لمروة محي في 23-08-2026 الساعة 20:30 مع الدكتور آدم. لحظة من فضلك.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
          toolCalls: [
            {
              id: "call-create-customer",
              name: "create_customer",
              arguments: { name: "مروة محي", phone: "201023169075" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routedKeys.push(input.toolKey);
        if (input.toolKey === "create_customer") {
          return {
            toolKey: "create_customer",
            executionId: "exec-create-customer-now",
            status: "succeeded",
            output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
            durationMs: 1,
          };
        }
        assert.equal(input.input.customerId, "1e6e345e-5180-46fc-9f2b-01f832a6a432");
        assert.equal(input.input.date, "2026-08-23");
        assert.equal(input.input.slotStart, "20:30");
        assert.equal(input.input.serviceId, "a8a6403e-4c88-48ae-aa46-d204ea8ef49d");
        assert.equal(input.input.resourceId, "1c766372-7726-4cb6-b660-b88ae85fb49c");
        return {
          toolKey: "create_booking",
          executionId: "exec-create-booking-now",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "68d29c17-ad91-4c92-b2b2-08f72cba4873",
            bookingRef: "68D29C17",
            date: "2026-08-23",
            slotStart: "20:30",
            customerFacingMessage:
              "تم حجز موعدك بنجاح.\nالموعد: يوم 23-08-2026 الساعة 20:30\nرقم الحجز: 68D29C17",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content:
              "SCHEDULING CATALOG\n- عيادة: serviceId=a8a6403e-4c88-48ae-aa46-d204ea8ef49d\n- ADAM: resourceId=1c766372-7726-4cb6-b660-b88ae85fb49c",
          },
          { role: "user", content: "23-08-2026\n20:30" },
          { role: "user", content: "مروة محي\n25\n201023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.deepEqual(routedKeys, ["create_customer", "create_booking"]);
    assert.match(result.response.text, /تم حجز موعدك بنجاح/);
    assert.match(result.response.text, /يوم 23-08-2026 الساعة 20:30/);
    assert.doesNotMatch(result.response.text, /سأقوم الآن بحجز/);
    assert.doesNotMatch(result.response.text, /لحظة من فضلك/);
  });

  it("does not book after slot pick when the customer only sends a casual reply like هاي", async () => {
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تم حجز موعدك بنجاح.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
          toolCalls: [
            {
              id: "call-create-customer",
              name: "create_customer",
              arguments: { name: "هاي", phone: "201023169075" },
            },
            {
              id: "call-create-booking",
              name: "create_booking",
              arguments: {
                customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                serviceId: "a8a6403e-4c88-48ae-aa46-d204ea8ef49d",
                resourceId: "1c766372-7726-4cb6-b660-b88ae85fb49c",
                date: "2026-08-25",
                slotStart: "20:30",
              },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        routedKeys.push(input.toolKey);
        throw new Error(`${input.toolKey} should be blocked before intake is complete`);
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة احجز ميعاد مع دكتور Adam" },
          { role: "user", content: "25-08-2026\n20:30" },
          { role: "user", content: "هاي" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.deepEqual(routedKeys, []);
    assert.match(result.response.text, /اسم (?:المريض|العميل) ورقم موبايل/);
    assert.doesNotMatch(result.response.text, /تم حجز موعدك بنجاح/);
  });

  it("asks for full patient intake after slot pick instead of phone-only when booking intent was mistaken for a name", async () => {
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين رقم موبايل المريض عشان نكمّل الحجز. ممكن تبعتيه؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
          toolCalls: [
            {
              id: "call-search-customer",
              name: "search_customer",
              arguments: { query: "201023169075" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_customer", "create_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        routedKeys.push(input.toolKey);
        return {
          toolKey: input.toolKey,
          executionId: `exec-${input.toolKey}`,
          status: "succeeded",
          output: { success: true, total: 1, customers: [{ id: "1e6e345e-5180-46fc-9f2b-01f832a6a432", name: "نسمة حسام الدين" }] },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة احجز ميعاد مع دكتور Adam" },
          { role: "user", content: "25-08-2026\n20:30" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_customer" } },
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_customer", "create_customer", "create_booking"],
    });

    assert.deepEqual(routedKeys, []);
    assert.match(result.response.text, /اسم (?:المريض|العميل) ورقم موبايل/);
    assert.doesNotMatch(result.response.text, /رقم موبايل المريض عشان نكمّل الحجز\. ممكن تبعتيه/);
  });

  it("Phase 5Q.1: asks only name+age when phone already on booking+slot turn", async () => {
    const routedKeys: string[] = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين اسم المريض ورقم موبايل المريض عشان نكمّل الحجز. ممكن تقوليلي الاسم ورقم الموبايل؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
          toolCalls: [],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_customer", "create_customer", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string }) => {
        routedKeys.push(input.toolKey);
        return {
          toolKey: input.toolKey,
          executionId: `exec-${input.toolKey}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content:
              "عايز أحجز موعد عيادة يوم 24-08-2026 الساعة 9:00 صباحاً مع آدم ورقمي 01023169075",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_customer" } },
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_customer", "create_customer", "create_booking"],
    });

    assert.deepEqual(routedKeys, []);
    assert.match(result.response.text, /اسم (?:المريض|العميل)/);
    assert.doesNotMatch(result.response.text, /رقم موبايل المريض عشان نكمّل الحجز/);
    assert.doesNotMatch(result.response.text, /ورقم موبايل المريض/);
  });

  it("Phase 5Q.1: create-booking slot+phone must not force cancel search_bookings", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];

    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
          latencyMs: 5,
          toolCalls: [
            {
              id: "call-create-customer",
              name: "create_customer",
              arguments: { name: "أحمد تجريبي", phone: "201023169075" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => [
        "search_bookings",
        "cancel_booking",
        "create_customer",
        "create_booking",
        "search_availability",
      ],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: input.toolKey, input: input.input });
        if (input.toolKey === "create_customer") {
          return {
            toolKey: input.toolKey,
            executionId: "exec-create-customer",
            status: "succeeded",
            output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
            durationMs: 1,
          };
        }
        if (input.toolKey === "create_booking") {
          return {
            toolKey: input.toolKey,
            executionId: "exec-create-booking",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "new-booking",
              confirmationNumber: "BK-000099",
              customerFacingMessage: "تم الحجز BK-000099",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: input.toolKey,
          executionId: `exec-${input.toolKey}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content:
              "You can cancel bookings with search_bookings purpose=cancel. Also create_booking after intake.\nSCHEDULING CATALOG:\n- عيادة: serviceId=a8a6403e-4c88-48ae-aa46-d204ea8ef49d\n- ADAM: resourceId=1c766372-7726-4cb6-b660-b88ae85fb49c\n- ADAM offers عيادة (serviceId=a8a6403e-4c88-48ae-aa46-d204ea8ef49d, resourceId=1c766372-7726-4cb6-b660-b88ae85fb49c)",
          },
          { role: "user", content: "عايز أحجز موعد" },
          { role: "assistant", content: "ما هو نوع الخدمة؟" },
          {
            role: "user",
            content:
              "عيادة يوم 26-08-2026 الساعة 10:00 صباحاً مع آدم\nاسم المريض: أحمد تجريبي\nعمر: 30\nرقمي 01023169075",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: [
        "search_bookings",
        "cancel_booking",
        "create_customer",
        "create_booking",
        "search_availability",
      ],
    });

    assert.equal(
      routed.some((entry) => entry.toolKey === "search_bookings"),
      false,
      `search_bookings should not run during create; got ${JSON.stringify(routed)}`,
    );
    assert.equal(
      routed.some((entry) => entry.toolKey === "cancel_booking"),
      false,
    );
    assert.ok(
      routed.some((entry) => entry.toolKey === "create_customer" || entry.toolKey === "create_booking"),
      `expected create path; got ${JSON.stringify(routed)}`,
    );
    assert.doesNotMatch(result.response.text, /ممكن إلغاؤه|أنهي موعد تلغي|لقيت \d+ حجز/);
  });

  it("Phase 5Q.1: parses single-line labeled name/age/phone and does not re-ask intake", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين اسم المريض عشان نكمّل الحجز. ممكن تقوليلي الاسم؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 5,
          toolCalls: [],
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking", "search_availability"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push(input.toolKey);
        if (input.toolKey === "create_customer") {
          return {
            toolKey: input.toolKey,
            executionId: "exec-cc",
            status: "succeeded",
            output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
            durationMs: 1,
          };
        }
        if (input.toolKey === "create_booking") {
          return {
            toolKey: input.toolKey,
            executionId: "exec-cb",
            status: "succeeded",
            output: {
              success: true,
              confirmationNumber: "BK-000100",
              customerFacingMessage: "تم الحجز BK-000100",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: input.toolKey,
          executionId: `exec-${input.toolKey}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content:
              "عايز أحجز موعد عيادة 26-08-2026 الساعة 10:00 مع آدم. اسم المريض: أحمد تجريبي. عمر: 30. رقمي 01023169075",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking", "search_availability"],
    });

    assert.ok(routed.includes("create_customer") || routed.includes("create_booking"));
    assert.doesNotMatch(result.response.text, /محتاجين اسم المريض/);
  });

  it("skips duplicate create_ticket in the same turn and forces the exact ticket number in the reply", async () => {
    let completionCalls = 0;
    let createTicketRoutes = 0;

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
                  name: "create_ticket",
                  arguments: { subject: "مشكلة في دفع حجز العيادة" },
                },
                {
                  id: "call-2",
                  name: "create_ticket",
                  arguments: { subject: "مشكلة الدفع لحجز العيادة" },
                },
              ],
            };
          }
          return {
            text: "تم فتح التذكرة رقم TKT-999999",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
            latencyMs: 4,
          };
        }
        return {
          text: "تم فتح التذكرة رقم TKT-999999",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 8, totalTokens: 28 },
          latencyMs: 7,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["create_ticket"],
      route: async () => {
        createTicketRoutes += 1;
        return {
          toolKey: "create_ticket",
          executionId: `exec-${createTicketRoutes}`,
          status: "succeeded",
          output: {
            success: true,
            reused: false,
            ticketId: "ticket-real",
            ticketNumber: "TKT-000022",
            ticket: { ticketNumber: "TKT-000022" },
            message: "Ticket created. Tell the customer the exact ticketNumber TKT-000022.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "عندي مشكلة في دفع حجز العيادة" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_ticket" } }],
      allowedToolKeys: ["create_ticket"],
    });

    assert.equal(createTicketRoutes, 1);
    assert.match(result.response.text, /TKT-000022/);
    assert.doesNotMatch(result.response.text, /TKT-999999/);
  });

  it("asks for ticket number when the model claims it cannot track a complaint", async () => {
    let searchRoutes = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "للأسف، ليس لدي القدرة على البحث عن حالة الشكاوى.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_ticket"],
      route: async () => {
        searchRoutes += 1;
        return {
          toolKey: "search_ticket",
          executionId: "exec-search-1",
          status: "succeeded",
          output: { success: true, total: 0, tickets: [] },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [{ role: "user", content: "طب عايزة اتتبع شكوي" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_ticket" } }],
      allowedToolKeys: ["search_ticket"],
    });

    assert.equal(searchRoutes, 0);
    assert.match(result.response.text, /رقم الشكوى/);
    assert.doesNotMatch(result.response.text, /ليس لدي القدرة/);
    assert.doesNotMatch(result.response.text, /الموضوع/);
  });

  it("searches by ticket number and overwrites a wrong model status", async () => {
    let searchInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "رقم الشكوى: TKT-000085\nالحالة: مقفولة",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_ticket"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        assert.equal(input.toolKey, "search_ticket");
        searchInput = input.input;
        return {
          toolKey: "search_ticket",
          executionId: "exec-search-1",
          status: "succeeded",
          output: {
            success: true,
            total: 1,
            matchedTicketNumber: "TKT-000085",
            status: "open",
            priority: "high",
            createdAt: "2026-08-20T20:00:00.000Z",
            tickets: [
              {
                ticketNumber: "TKT-000085",
                status: "open",
                priority: "high",
                createdAt: "2026-08-20T20:00:00.000Z",
              },
            ],
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة اتتبع شكوي" },
          { role: "assistant", content: "ابعتي رقم الشكوى" },
          { role: "user", content: "TKT-000085" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_ticket" } }],
      allowedToolKeys: ["search_ticket"],
    });

    assert.equal(searchInput?.query, "TKT-000085");
    assert.match(result.response.text, /TKT-000085/);
    assert.match(result.response.text, /مفتوحة/);
    assert.match(result.response.text, /مرتفعة/);
    assert.doesNotMatch(result.response.text, /مقفولة|مغلقة|الموضوع/);
  });

  it("searches bookings by phone and forces a customer-facing reply", async () => {
    let searchInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        assert.equal(input.toolKey, "search_bookings");
        searchInput = input.input;
        return {
          toolKey: "search_bookings",
          executionId: "exec-search-bookings-1",
          status: "succeeded",
          output: {
            success: true,
            total: 1,
            bookings: [
              {
                bookingId: "booking-1",
                reference: "BK-000055",
                scheduledAt: "2026-08-25T18:15:00.000Z",
                status: "confirmed",
                serviceName: "عيادة",
                employeeName: "ADAM",
              },
            ],
            customerFacingMessage:
              "لقيت 1 حجز:\n1) رقم الحجز: BK-000055 | الموعد: 25-08-2026 الساعة 21:15 | الخدمة: عيادة | مع: ADAM | الحالة: مؤكد",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة أشوف الحجوزات" },
          { role: "assistant", content: "ابعتي رقم الموبايل" },
          { role: "user", content: "01021232123" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_bookings" } }],
      allowedToolKeys: ["search_bookings"],
    });

    assert.equal(searchInput?.phone, "201021232123");
    assert.match(result.response.text, /BK-000055/);
    assert.match(result.response.text, /عيادة/);
  });

  it("asks which booking to cancel and blocks cancel_booking until selected", async () => {
    let cancelAttempted = false;
    let searchPurpose: unknown = null;
    let gatewayCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        gatewayCalls += 1;
        if (gatewayCalls > 1) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
            latencyMs: 3,
          };
        }
        return {
          text: "سأقوم بإلغاء كل الحجوزات",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
          toolCalls: [
            {
              id: "call-cancel",
              name: "cancel_booking",
              arguments: { bookingId: "booking-1" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "cancel_booking") {
          cancelAttempted = true;
          return {
            toolKey: "cancel_booking",
            executionId: "exec-cancel",
            status: "succeeded",
            output: { success: true, bookingId: "booking-1" },
            durationMs: 1,
          };
        }
        searchPurpose = input.input.purpose;
        return {
          toolKey: "search_bookings",
          executionId: "exec-search-bookings-cancel",
          status: "succeeded",
          output: {
            success: true,
            purpose: "cancel",
            total: 2,
            bookings: [
              {
                bookingId: "booking-1",
                reference: "BK-000028",
                scheduledAt: "2026-08-25T18:30:00.000Z",
                status: "confirmed",
                serviceName: "عيادة",
                employeeName: "ADAM",
              },
              {
                bookingId: "booking-2",
                reference: "BK-000025",
                scheduledAt: "2026-08-24T17:30:00.000Z",
                status: "confirmed",
                serviceName: "عيادة",
                employeeName: "ADAM",
              },
            ],
            customerFacingMessage:
              "لقيت 2 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000028 | الموعد: 25-08-2026 الساعة 21:30\n2) رقم الحجز: BK-000025 | الموعد: 24-08-2026 الساعة 20:30\nقولّي أنهي موعد تلغي؟ ابعتي رقم القائمة (مثلاً 1 أو 2) أو رقم الحجز (مثل BK-000028). مش هألغي غير بعد ما تختاري.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة الغي ميعاد ليا" },
          { role: "assistant", content: "ابعتي رقم الموبايل" },
          { role: "user", content: "01023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.equal(cancelAttempted, false);
    assert.equal(searchPurpose, "cancel");
    assert.match(result.response.text, /أنهي موعد/);
    assert.match(result.response.text, /BK-000028/);
    assert.match(result.response.text, /BK-000025/);
  });

  it("cancels the selected booking on the next turn without re-listing or starting a new booking", async () => {
    let cancelInput: Record<string, unknown> | null = null;
    let createBookingAttempted = false;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين اسم المريض عشان نكمّل الحجز",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "create_booking") {
          createBookingAttempted = true;
          return {
            toolKey: "create_booking",
            executionId: "exec-create",
            status: "succeeded",
            output: { success: true, bookingId: "new-booking" },
            durationMs: 1,
          };
        }
        if (input.toolKey === "cancel_booking") {
          cancelInput = input.input;
          return {
            toolKey: "cancel_booking",
            executionId: "exec-cancel-selected",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-2",
              reference: "BK-000025",
              customerFacingMessage: "تم إلغاء الحجز BK-000025 بنجاح.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: "search_bookings",
          executionId: "exec-search-for-cancel",
          status: "succeeded",
          output: {
            success: true,
            purpose: "cancel",
            total: 2,
            bookings: [
              {
                bookingId: "booking-1",
                reference: "BK-000028",
                scheduledAt: "2026-08-25T18:30:00.000Z",
                status: "confirmed",
              },
              {
                bookingId: "booking-2",
                reference: "BK-000025",
                scheduledAt: "2026-08-24T17:30:00.000Z",
                status: "confirmed",
              },
            ],
            customerFacingMessage:
              "لقيت 2 موعد ممكن إلغاؤه:\n1) BK-000028\n2) BK-000025\nقولّي أنهي موعد تلغي؟",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة الغي ميعاد ليا" },
          { role: "assistant", content: "ابعتي رقم الموبايل" },
          { role: "user", content: "01023169075" },
          {
            role: "assistant",
            content:
              "لقيت 2 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000028\n2) رقم الحجز: BK-000025\nقولّي أنهي موعد تلغي؟",
          },
          { role: "user", content: "BK-000025" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking", "create_booking"],
    });

    assert.equal(createBookingAttempted, false);
    assert.equal(cancelInput?.bookingReference, "BK-000025");
    assert.equal(cancelInput?.conversationScopedCancel, true);
    assert.match(result.response.text, /تم إلغاء الحجز BK-000025/);
    assert.doesNotMatch(result.response.text, /اسم المريض والعمر|لقيت 2 موعد/);
  });

  it("cancels by BK reference from the cancel list without re-asking for phone", async () => {
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، ابعتي رقم الموبايل المسجّل على الحجز وأقولك المواعيد.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          latencyMs: 3,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "search_bookings") {
          throw new Error("search_bookings should not be required when cancelling by listed BK reference");
        }
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-by-ref",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-2",
            reference: "BK-000025",
            customerFacingMessage: "تم إلغاء الحجز BK-000025 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "assistant",
            content:
              "لقيت 2 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000028\n2) رقم الحجز: BK-000025\nقولّي أنهي موعد تلغي؟",
          },
          { role: "user", content: "BK-000025" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.equal(cancelInput?.bookingReference, "BK-000025");
    assert.equal(cancelInput?.conversationScopedCancel, true);
    assert.match(result.response.text, /تم إلغاء الحجز BK-000025/);
    assert.doesNotMatch(result.response.text, /رقم الموبايل المسجّل|وأقولك المواعيد/);
  });

  it("cancels by BK reference before calling the LLM on the selection turn", async () => {
    let gatewayCalls = 0;
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        gatewayCalls += 1;
        return {
          text: "should not be used",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-early",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-22",
            reference: "BK-000022",
            customerFacingMessage: "تم إلغاء الحجز BK-000022 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "assistant",
            content:
              "لقيت 1 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000022\nقولّي أنهي موعد تلغي؟",
          },
          { role: "user", content: "BK-000022" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "cancel_booking" } }],
      allowedToolKeys: ["cancel_booking"],
    });

    assert.equal(gatewayCalls, 0);
    assert.equal(cancelInput?.bookingReference, "BK-000022");
    assert.equal(cancelInput?.conversationScopedCancel, true);
    assert.match(result.response.text, /تم إلغاء الحجز BK-000022/);
  });

  it("does not re-list bookings when phone is in history and user sends listed BK", async () => {
    const routedTools: string[] = [];
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not reach LLM",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routedTools.push(input.toolKey);
        if (input.toolKey === "search_bookings") {
          throw new Error("search_bookings must not run on BK selection when list was already offered");
        }
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-no-relist",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-24",
            reference: "BK-000024",
            customerFacingMessage: "تم إلغاء الحجز BK-000024 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "Please cancel my booking." },
          { role: "assistant", content: "تمام، ابعتي رقم الموبايل المسجّل على الحجز." },
          { role: "user", content: "01023169075" },
          {
            role: "assistant",
            content:
              "لقيت 2 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000024\n2) رقم الحجز: BK-000025\nقولّي أنهي موعد تلغي؟",
          },
          { role: "user", content: "BK-000024" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.deepEqual(routedTools, ["cancel_booking"]);
    assert.equal(cancelInput?.bookingReference, "BK-000024");
    assert.equal(cancelInput?.conversationScopedCancel, true);
    assert.match(result.response.text, /تم إلغاء الحجز BK-000024/);
    assert.doesNotMatch(result.response.text, /لقيت \d+ موعد|رقم الحجز: BK-000025/);
  });

  it("cancels from English cancel list without Arabic cues and without re-search", async () => {
    const routedTools: string[] = [];
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not reach LLM",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routedTools.push(input.toolKey);
        if (input.toolKey === "search_bookings") {
          throw new Error("search_bookings must not run after BK selection from cancel list");
        }
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-en",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-30",
            reference: "BK-000030",
            customerFacingMessage: "تم إلغاء الحجز BK-000030 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "Please cancel my booking." },
          {
            role: "assistant",
            content:
              "Please select which booking to cancel:\n1) BK-000030\n2) BK-000031\nReply with the booking reference.",
          },
          { role: "user", content: "BK-000030" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.deepEqual(routedTools, ["cancel_booking"]);
    assert.equal(cancelInput?.bookingReference, "BK-000030");
    assert.equal(cancelInput?.conversationScopedCancel, true);
    assert.match(result.response.text, /تم إلغاء الحجز BK-000030/);
  });

  it("blocks LLM search_bookings on cancel selection turn and cancels instead", async () => {
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(request) {
        const last = request.messages[request.messages.length - 1];
        if (last?.role === "tool") {
          return {
            text: "تم إلغاء الحجز.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        }
        // Simulate a buggy LLM that tries to re-list instead of cancel.
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          toolCalls: [
            {
              id: "tc-search",
              name: "search_bookings",
              arguments: { phone: "01023169075", purpose: "cancel" },
            },
          ],
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "search_bookings") {
          throw new Error("LLM search_bookings must be blocked on BK selection turn");
        }
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-block-search",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-24",
            reference: "BK-000024",
            customerFacingMessage: "تم إلغاء الحجز BK-000024 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "cancel booking" },
          {
            role: "assistant",
            content: "Select a booking:\nBK-000024\nBK-000025",
          },
          { role: "user", content: "BK-000024" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    // Early force-cancel should short-circuit before the LLM re-lists.
    assert.equal(cancelInput?.bookingReference, "BK-000024");
    assert.match(result.response.text, /تم إلغاء الحجز BK-000024/);
  });

  it("cancels by BK with phone ownership when cancel list scrolled out of history", async () => {
    let cancelInput: Record<string, unknown> | null = null;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not be used",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        if (input.toolKey === "search_bookings") {
          return {
            toolKey: "search_bookings",
            executionId: "exec-search",
            status: "succeeded",
            output: {
              success: true,
              purpose: "cancel",
              bookings: [
                {
                  bookingId: "booking-22",
                  reference: "BK-000022",
                  status: "confirmed",
                },
              ],
              customerFacingMessage: "list",
            },
            durationMs: 1,
          };
        }
        cancelInput = input.input;
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel-phone",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-22",
            reference: "BK-000022",
            customerFacingMessage: "تم إلغاء الحجز BK-000022 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "01023169075" },
          { role: "user", content: "BK-000022" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.equal(cancelInput?.bookingId, "booking-22");
    assert.match(result.response.text, /تم إلغاء الحجز BK-000022/);
  });

  it("does not force cancel-purpose search after topic changes to find next available", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    let llmCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        llmCalls += 1;
        return {
          text: "should not reach LLM when find_next is forced",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };

    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking", "find_next_available", "search_availability"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: input.toolKey, input: input.input });
        if (input.toolKey === "search_bookings" || input.toolKey === "search_availability") {
          throw new Error(`${input.toolKey} must not run for nearest-appointment intent`);
        }
        return {
          toolKey: "find_next_available",
          executionId: "exec-next",
          status: "succeeded",
          output: {
            success: true,
            slot: {
              date: "2026-08-26",
              start: "10:00",
              resourceName: "ADAM",
            },
            customerFacingMessage: "أقرب موعد متاح: يوم 2026-08-26 الساعة 10:00 مع ADAM.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content:
              "SCHEDULING CATALOG\n- عيادة : serviceId=a8a6403e-4c88-48ae-aa46-d204ea8ef49d offers ADAM resourceId=1c766372-7726-4cb6-b660-b88ae85fb49c",
          },
          { role: "user", content: "Please cancel my booking." },
          {
            role: "assistant",
            content: "لقيت 1 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000033\nقولّي أنهي موعد تلغي؟",
          },
          { role: "user", content: "BK-000033" },
          { role: "assistant", content: "تم إلغاء الحجز BK-000033 بنجاح." },
          { role: "user", content: "إيه أقرب موعد متاح لعيادة؟" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
        { type: "function", function: { name: "find_next_available" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: [
        "search_bookings",
        "cancel_booking",
        "find_next_available",
        "search_availability",
      ],
    });

    assert.equal(llmCalls, 0, "force find_next must short-circuit before LLM");
    assert.deepEqual(
      routed.map((item) => item.toolKey),
      ["find_next_available"],
    );
    assert.equal(routed[0]?.input.serviceId, "a8a6403e-4c88-48ae-aa46-d204ea8ef49d");
    assert.match(result.response.text, /أقرب موعد/);
    assert.doesNotMatch(result.response.text, /ممكن إلغاؤه|أنهي موعد تلغي|المواعيد المتاحة مع/);
  });

  it("Phase 5Q.2: nearest intent forces find_next_available and blocks search_availability", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          toolCalls: [
            {
              id: "tc-search",
              name: "search_availability",
              arguments: { serviceId: "a8a6403e-4c88-48ae-aa46-d204ea8ef49d" },
            },
          ],
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            slot: { date: "2026-08-23", start: "19:00", resourceName: "ADAM" },
            customerFacingMessage: "أقرب موعد متاح: يوم 2026-08-23 الساعة 19:00 مع ADAM.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "system",
            content:
              "SCHEDULING CATALOG\n- عيادة : serviceId=a8a6403e-4c88-48ae-aa46-d204ea8ef49d offers ADAM resourceId=1c766372-7726-4cb6-b660-b88ae85fb49c",
          },
          { role: "user", content: "What's the earliest available appointment for عيادة?" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "find_next_available" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: ["find_next_available", "search_availability"],
    });

    assert.deepEqual(
      routed.map((item) => item.toolKey),
      ["find_next_available"],
    );
    assert.match(result.response.text, /أقرب موعد متاح: يوم 2026-08-23 الساعة 19:00/);
  });

  it("Phase 5Q.1: forces check_in with BK+phone and never cancel-purpose search", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not reach LLM when check_in succeeds early",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["check_in", "search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "cancel_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              reference: "BK-000035",
              customerFacingMessage: "تم إلغاء الحجز BK-000035 بنجاح.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-35",
            status: "checked_in",
            customerFacingMessage: "تم تسجيل الحضور للحجز BK-000035 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز أسجل حضوري للحجز BK-000035 ورقمي 01023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "check_in" } },
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["check_in", "search_bookings", "cancel_booking"],
    });

    assert.deepEqual(
      routed.map((item) => item.toolKey),
      ["check_in"],
    );
    assert.equal(routed[0]?.input.bookingReference, "BK-000035");
    assert.equal(routed[0]?.input.phone, "201023169075");
    assert.match(result.response.text, /تم تسجيل الحضور للحجز BK-000035/);
    assert.doesNotMatch(result.response.text, /إلغاء|ألغي/);
  });

  it("checkbox OFF: forceCheckInOutIfReady does not route check_in when unassigned", async () => {
    const routed: Array<{ toolKey: string }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، ابعتي رقم الحجز عشان أسجل الحضور.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push({ toolKey: req.toolKey });
        return {
          toolKey: req.toolKey,
          executionId: "exec-should-not-run",
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-checkin-off",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز أسجل حضوري للحجز BK-000035 ورقمي 01023169075" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-checkin-off",
          userId: "user-1",
        },
      },
      tools: [{ type: "function", function: { name: "search_bookings" } }],
      allowedToolKeys: ["search_bookings"],
    });
    assert.equal(
      routed.some((entry) => entry.toolKey === "check_in" || entry.toolKey === "check_out"),
      false,
    );
  });

  it("ticket intent after check-out does not force check_out", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "tool_calls",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
          toolCalls: [{ id: "call-ticket", name: "create_ticket", arguments: { subject: "شكوى" } }],
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["check_out", "create_ticket"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${req.toolKey}`,
          status: "succeeded",
          output: {
            success: true,
            ticketNumber: "TKT-000090",
            customerFacingMessage: "تم فتح الشكوى رقم TKT-000090",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-ticket-after-checkout",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "user", content: "أسجل انصراف BK-000083" },
          { role: "assistant", content: "تم تسجيل الانصراف." },
          { role: "user", content: "عايز أفتح شكوى" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-ticket-after-checkout", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "check_out" } },
        { type: "function", function: { name: "create_ticket" } },
      ],
      allowedToolKeys: ["check_out", "create_ticket"],
    });
    assert.equal(routed.includes("check_out"), false);
    assert.equal(routed.includes("create_ticket"), true);
    assert.match(result.response.text, /TKT-000090/);
  });

  it("cancel after prior check-in: does not force check_in on ألغي BK-…", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not matter — cancel force path owns the turn",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["check_in", "search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "cancel_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              reference: "BK-000182",
              customerFacingMessage: "تم إلغاء الحجز BK-000182 بنجاح.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            status: "checked_in",
            customerFacingMessage: "تم تسجيل الحضور للحجز BK-000182 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-cancel-after-checkin",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز أسجل حضوري للحجز BK-000835" },
          { role: "assistant", content: "تم تسجيل الحضور للحجز BK-000835 بنجاح." },
          {
            role: "assistant",
            content:
              'لقيت موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000182 | الموعد: 08-09-2026\nقولّي أنهي موعد تلغي؟',
          },
          { role: "user", content: "ألغي BK-000182" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-cancel-after-checkin",
          userId: "user-1",
          pageContext: { trustedCustomerId: "customer-omar" },
        },
      },
      tools: [
        { type: "function", function: { name: "check_in" } },
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["check_in", "search_bookings", "cancel_booking"],
    });

    assert.equal(
      routed.some((entry) => entry.toolKey === "check_in"),
      false,
      `check_in must not run on cancel turn; routed=${JSON.stringify(routed)}`,
    );
    assert.ok(
      routed.some((entry) => entry.toolKey === "cancel_booking"),
      `expected cancel_booking; routed=${JSON.stringify(routed)}`,
    );
    assert.match(result.response.text, /تم إلغاء الحجز BK-000182/);
    assert.doesNotMatch(result.response.text, /تم تسجيل الحضور/);
  });

  it("checkbox OFF: forceRescheduleIfReady does not route reschedule_booking when unassigned", async () => {
    const routed: Array<{ toolKey: string }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، هشوف المواعيد المتاحة.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "search_bookings"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push({ toolKey: req.toolKey });
        return {
          toolKey: req.toolKey,
          executionId: "exec-should-not-run",
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-reschedule-off",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content: "عايز أغيّر ميعاد BK-000035 ليوم 27-08-2026 الساعة 08:00 ورقمي 01023169075",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-reschedule-off",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "search_bookings" } },
      ],
      allowedToolKeys: ["search_availability", "search_bookings"],
    });
    assert.equal(
      routed.some((entry) => entry.toolKey === "reschedule_booking"),
      false,
    );
  });

  it("Phase 5Q.1: reschedule with BK+new slot must not force cancel_booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not reach LLM when reschedule succeeds early",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => [
        "reschedule_booking",
        "search_bookings",
        "cancel_booking",
        "search_availability",
      ],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "reschedule_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-26",
              reference: "BK-000026",
              customerFacingMessage:
                "تم تغيير ميعاد الحجز BK-000026 بنجاح ليوم 24-08-2026 الساعة 08:00.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content: "عايز أغير ميعاد الحجز BK-000026 ليوم 24-08-2026 الساعة 08:00 ورقمي 01023169075",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "reschedule_booking" } },
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: [
        "reschedule_booking",
        "search_bookings",
        "cancel_booking",
        "search_availability",
      ],
    });

    assert.equal(
      routed.filter((item) => item.toolKey === "cancel_booking").length,
      0,
      "cancel_booking must not run on reschedule turns",
    );
    assert.deepEqual(
      routed.map((item) => item.toolKey),
      ["reschedule_booking"],
    );
    assert.equal(routed[0]?.input.bookingReference, "BK-000026");
    assert.equal(routed[0]?.input.bookingId, "BK-000026");
    assert.equal(routed[0]?.input.date, "2026-08-24");
    assert.equal(routed[0]?.input.slotStart, "08:00");
    assert.equal(routed[0]?.input.phone, "201023169075");
    assert.match(result.response.text, /تم تغيير ميعاد الحجز BK-000026/);
    assert.doesNotMatch(result.response.text, /تم إلغاء|ألغي الحجز|اسم المريض/);
  });

  it("reschedule weekday+time beats stale create-booking slot from history", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "should not reach LLM",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["reschedule_booking", "create_booking", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            reference: "BK-000777",
            customerFacingMessage: "تم تغيير ميعاد الحجز BK-000777 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-reschedule-stale-slot",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:00 مساء" },
          {
            role: "assistant",
            content: "المواعيد المتاحة:\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:00 مساءً\nاختاري الموعد المناسب",
          },
          {
            role: "user",
            content: "عايز أغير ميعاد الحجز BK-000777 ليوم الخميس الساعة 09:15 مساء",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-reschedule-stale-slot",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "reschedule_booking" } },
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: ["reschedule_booking", "create_booking", "search_availability"],
    });

    assert.deepEqual(
      routed.map((item) => item.toolKey),
      ["reschedule_booking"],
    );
    assert.equal(routed[0]?.input.bookingReference, "BK-000777");
    assert.equal(routed[0]?.input.slotStart, "21:15");
    // Must be a Thursday Cairo date — not the stale Wednesday create-booking day.
    const date = String(routed[0]?.input.date ?? "");
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    assert.equal(weekday, 4, `expected Thursday for ${date}, got weekday=${weekday}`);
  });

  it("Phase 5Q.1: reschedule without phone asks for phone and does not invent create intake", async () => {
    let llmCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        llmCalls += 1;
        return {
          text: "محتاجين اسم المريض عشان نكمّل الحجز. ممكن تقوليلي الاسم؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["reschedule_booking", "create_booking", "create_customer"],
      route: async () => {
        throw new Error("route must not run without phone");
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content: "عايز أغير ميعاد الحجز BK-000026 ليوم 24-08-2026 الساعة 08:00",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "reschedule_booking" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["reschedule_booking", "create_booking", "create_customer"],
    });

    assert.equal(llmCalls, 0, "must short-circuit before LLM when reschedule guidance is ready");
    assert.match(result.response.text, /رقم موبايل/);
    assert.doesNotMatch(result.response.text, /اسم المريض/);
    assert.equal(result.toolExecutions[0]?.toolKey, "reschedule_booking");
    assert.equal(result.toolExecutions[0]?.output?.errors?.[0], "CUSTOMER_CONTEXT_REQUIRED");
  });

  it("Phase 5Q.4: name+phone intake on create-booking turn does not force search_bookings", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، هكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, customerId: "11111111-1111-4111-8111-111111111111" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز يوم الأحد الساعة 7 2026-08-23" },
          { role: "user", content: "عمر مجدي 01012345678" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "create_customer", "create_booking"],
    });

    assert.equal(routed.includes("search_bookings"), false);
    assert.ok(routed.includes("create_customer") || result.toolExecutions.some((e) => e.toolKey === "create_customer"));
  });

  it("Phase 5Q.4: incomplete phone asks for complete number without booking search", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "ابعتي رقم الموبايل المسجل على الحجز",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز 2026-08-23 19:00" },
          { role: "user", content: "عمر مجدي 010133637" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "create_customer" } },
      ],
      allowedToolKeys: ["search_bookings", "create_customer", "create_booking"],
    });

    assert.equal(routed.includes("search_bookings"), false);
    assert.equal(routed.includes("create_customer"), false);
    assert.match(result.response.text, /غير مكتمل|11 رقم/);
    assert.doesNotMatch(result.response.text, /المسجل على الحجز/);
  });

  it("Phase 5Q.1: date digits in reschedule text are not treated as phone", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "هغيّر ميعاد BK-000026 بعد ما أتأكد من المتاح.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking", "reschedule_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: false,
            errors: ["CUSTOMER_CONTEXT_REQUIRED"],
            customerFacingMessage: "محتاجين رقم موبايل المريض عشان نأكد ملكية الحجز قبل تغيير الميعاد.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          {
            role: "user",
            content: "عايز أغير ميعاد الحجز BK-000026 ليوم 24-08-2026 الساعة 08:00",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
        { type: "function", function: { name: "reschedule_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking", "reschedule_booking"],
    });

    assert.equal(
      routed.filter((item) => item.toolKey === "cancel_booking").length,
      0,
      "must not force cancel from date-as-phone on reschedule",
    );
    assert.equal(
      routed.length,
      0,
      "must not route reschedule with date digits mistaken as phone",
    );
    assert.equal(result.toolExecutions[0]?.toolKey, "reschedule_booking");
    assert.equal(result.toolExecutions[0]?.output?.errors?.[0], "CUSTOMER_CONTEXT_REQUIRED");
    assert.match(result.response.text, /موبايل|هاتف|رقم/);
    assert.doesNotMatch(result.response.text, /اسم المريض/);
  });

  const CLINIC_SERVICE_ID = "a8a6403e-4c88-48ae-aa46-d204ea8ef49d";
  const DENTAL_SERVICE_ID = "efbad361-d193-4ea7-a211-e23113b95f5a";
  const ADAM_RESOURCE_ID = "1c766372-7726-4cb6-b660-b88ae85fb49c";
  const SCHEDULING_CATALOG_SYSTEM = [
    "SCHEDULING CATALOG:",
    `- عيادة: serviceId=${CLINIC_SERVICE_ID}`,
    `- اسنان: serviceId=${DENTAL_SERVICE_ID}`,
    `- ADAM: resourceId=${ADAM_RESOURCE_ID}`,
    `- ADAM offers عيادة (serviceId=${CLINIC_SERVICE_ID}, resourceId=${ADAM_RESOURCE_ID})`,
  ].join("\n");

  it("Phase 5Q.4-FIX A: successful slot survives failed find_next_available retry", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-fna-fail",
                name: "find_next_available",
                arguments: { serviceId: DENTAL_SERVICE_ID },
              },
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: DENTAL_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-23",
                  slotStart: "19:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم الحجز",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "find_next_available") {
          const serviceId = String(req.input.serviceId ?? "");
          if (serviceId === CLINIC_SERVICE_ID) {
            return {
              toolKey: req.toolKey,
              executionId: "exec-clinic",
              status: "succeeded",
              output: {
                success: true,
                slot: {
                  date: "2026-08-23",
                  start: "19:00",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  resourceName: "ADAM",
                },
              },
              durationMs: 1,
            };
          }
          return {
            toolKey: req.toolKey,
            executionId: "exec-dental-fail",
            status: "succeeded",
            output: { success: false, slot: null, message: "No eligible resources found for this service." },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, bookingId: "booking-1" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "اسنان" },
          { role: "user", content: "عايز أول موعد متاح" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "hist-fna-ok",
                name: "find_next_available",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            content: JSON.stringify({
              success: true,
              slot: {
                date: "2026-08-23",
                start: "19:00",
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
              },
            }),
            toolCallId: "hist-fna-ok",
          },
          { role: "user", content: "2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار 01099887766" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "find_next_available" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["find_next_available", "create_customer", "create_booking"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "expected create_booking to be routed");
    assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID);
    assert.equal(createBooking.input.resourceId, ADAM_RESOURCE_ID);
    assert.notEqual(createBooking.input.serviceId, DENTAL_SERVICE_ID);
  });

  it("Phase 5Q.4-FIX B: does not force create_booking from find_next_available without explicit user slot", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-fna",
                name: "find_next_available",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: DENTAL_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-24",
                  slotStart: "10:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "find_next_available") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-fna",
            status: "succeeded",
            output: {
              success: true,
              slot: {
                date: "2026-08-23",
                start: "19:00",
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
              },
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "عايز أول موعد متاح" },
          { role: "user", content: "عميل اختبار 01099887766" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "find_next_available" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["find_next_available", "create_customer", "create_booking"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.equal(createBooking, undefined, "must not book before the user selects a date and time");
  });

  it("Phase 5Q.4-FIX B2: create_booking binds slot when user provides explicit date and time", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-fna",
                name: "find_next_available",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: DENTAL_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-24",
                  slotStart: "10:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "find_next_available") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-fna",
            status: "succeeded",
            output: {
              success: true,
              slot: {
                date: "2026-08-23",
                start: "19:00",
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
              },
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "عايز أول موعد متاح" },
          { role: "user", content: "2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار 01099887766" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "find_next_available" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["find_next_available", "create_customer", "create_booking"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking);
    assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID);
    assert.equal(createBooking.input.date, "2026-08-23");
    assert.equal(createBooking.input.slotStart, "19:00");
  });

  it("Phase 5Q.4-FIX C: incomplete phone with canonical tool slot blocks customer mutations", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              { id: "call-cc", name: "create_customer", arguments: { name: "اسنان", phone: "201013363637" } },
              { id: "call-cb", name: "create_booking", arguments: { customerId: "x", serviceId: CLINIC_SERVICE_ID } },
            ],
          };
        }
        return {
          text: "ok",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_customer", "create_booking", "search_customer"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "عايز أول موعد متاح" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "hist-fna",
                name: "find_next_available",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            content: JSON.stringify({
              success: true,
              slot: {
                date: "2026-08-23",
                start: "19:00",
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
              },
            }),
            toolCallId: "hist-fna",
          },
          { role: "user", content: "2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار" },
          { role: "user", content: "٠١٠١٣٣٦٣٧" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["find_next_available", "create_customer", "create_booking", "search_customer"],
    });

    assert.equal(routed.includes("create_customer"), false);
    assert.equal(routed.includes("create_booking"), false);
    assert.equal(routed.includes("search_customer"), false);
    assert.match(result.response.text, /غير مكتمل|11 رقم/);
  });

  it("Phase 5Q.4-FIX D: denies LLM padded phone while intake phone is incomplete", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-cc",
                name: "create_customer",
                arguments: { name: "عميل اختبار", phone: "01013363637" },
              },
            ],
          };
        }
        return { text: "ok", model: "mock-gpt", providerKey: "mock", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return { toolKey: req.toolKey, executionId: `exec-${routed.length}`, status: "succeeded", output: { success: true }, durationMs: 1 };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز 2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار 010133637" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_customer" } }],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.equal(routed.includes("create_customer"), false);
  });

  it("Phase 5Q.4-FIX E: explicit old-bookings lookup overrides incomplete-phone intake reply", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "رقم الموبايل يبدو غير مكتمل. من فضلك اكتب رقم الموبايل المكوّن من 11 رقم.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "booking_search", "create_customer"],
      route: async () => ({
        toolKey: "booking_search",
        executionId: "exec-1",
        status: "succeeded",
        output: { success: false, errorCode: "CUSTOMER_CONTEXT_REQUIRED" },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز 2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار" },
          { role: "user", content: "٠١٠١٣٣٦٣٧" },
          { role: "user", content: "عايز أعرف حجوزاتي القديمة" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "booking_search" } }],
      allowedToolKeys: ["search_bookings", "booking_search", "create_customer"],
    });

    assert.match(result.response.text, /حجوزاتك السابقة|المسجّل على الحجز/);
    assert.doesNotMatch(result.response.text, /غير مكتمل/);
  });

  it("Phase 5Q.4-FIX F: incomplete phone alone stays on create-booking intake", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return { text: "ابعتلي رقم الموبايل", model: "mock-gpt", providerKey: "mock", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "create_customer"],
      route: async () => ({ toolKey: "search_bookings", executionId: "exec-1", status: "succeeded", output: { success: true }, durationMs: 1 }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز 2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار" },
          { role: "user", content: "٠١٠١٣٣٦٣٧" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_customer" } }],
      allowedToolKeys: ["search_bookings", "create_customer", "create_booking"],
    });

    assert.match(result.response.text, /غير مكتمل|11 رقم/);
    assert.doesNotMatch(result.response.text, /حجوزاتك السابقة/);
  });

  it("Phase 5Q.4-FIX G: scheduling service name is not persisted as patient name", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return { text: "ok", model: "mock-gpt", providerKey: "mock", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "اسنان" },
          { role: "user", content: "عايز أول موعد متاح" },
          { role: "user", content: "2026-08-23 19:00" },
          { role: "user", content: "عميل اختبار" },
          { role: "user", content: "01099887766" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_customer" } }],
      allowedToolKeys: ["create_customer", "create_booking", "find_next_available"],
    });

    const createCustomer = routed.find((entry) => entry.toolKey === "create_customer");
    assert.ok(createCustomer);
    assert.equal(createCustomer.input.name, "عميل اختبار");
    assert.notEqual(createCustomer.input.name, "اسنان");
  });

  it("Phase 1A: availability output alone does not create a canonical selected slot", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                },
              },
            ],
          };
        }
        return {
          text: "اختاري الموعد المناسب لكِ وسأكمل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            serviceId: CLINIC_SERVICE_ID,
            resources: [
              {
                resourceId: ADAM_RESOURCE_ID,
                slots: [{ date: "2026-08-23", start: "19:00" }],
              },
            ],
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "عيادة" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "hist-search",
                name: "search_availability",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            content: JSON.stringify({
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [
                {
                  resourceId: ADAM_RESOURCE_ID,
                  slots: [{ date: "2026-08-23", start: "19:00" }],
                },
              ],
            }),
            toolCallId: "hist-search",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_availability", "create_customer", "create_booking"],
    });

    assert.equal(routed.find((entry) => entry.toolKey === "create_booking"), undefined);
    assert.equal(routed.find((entry) => entry.toolKey === "create_customer"), undefined);
  });

  it("Phase 1B: does not extract عياده or عيادة as customer name", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return { text: "ok", model: "mock-gpt", providerKey: "mock", finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, latencyMs: 1 };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432" },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });

    for (const serviceName of ["عياده", "عيادة", "اسنان", "أسنان"]) {
      routed.length = 0;
      await loop.run({
        ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
        conversationId: "conversation-1",
        gatewayRequest: {
          messages: [
            { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
            { role: "user", content: "عايز احجز" },
            { role: "user", content: serviceName },
            { role: "user", content: "2026-08-23 19:00" },
            { role: "user", content: "عمر مجدي 01099887766" },
          ],
          providerKey: "mock",
          model: "mock-gpt",
          context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
        },
        tools: [{ type: "function", function: { name: "create_customer" } }],
        allowedToolKeys: ["create_customer", "create_booking"],
      });
      const createCustomer = routed.find((entry) => entry.toolKey === "create_customer");
      assert.ok(createCustomer, `expected create_customer for service ${serviceName}`);
      assert.equal(createCustomer.input.name, "عمر مجدي", `service ${serviceName} must not become customer name`);
    }
  });

  it("Phase 2: trustedCustomerId satisfies booking identity without conversational name/phone", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    let sawIntakeDenial = false;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "00000000-0000-4000-8000-000000000099",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-23",
                  slotStart: "19:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking", "search_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-1",
            customerId: req.input.customerId,
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "user", content: "2026-08-23 19:00" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "create_customer" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer", "search_customer"],
    });

    const createCustomer = routed.find((entry) => entry.toolKey === "create_customer");
    assert.equal(createCustomer, undefined, "must not call create_customer merely to identify trusted customer");
    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "expected create_booking");
    assert.equal(createBooking.input.customerId, "1e6e345e-5180-46fc-9f2b-01f832a6a432");
    assert.notEqual(createBooking.input.customerId, "00000000-0000-4000-8000-000000000099");
    for (const message of result.messages) {
      if (message.role === "tool" && typeof message.content === "string") {
        if (/Collect customer name and mobile|Ask for name and mobile/i.test(message.content)) {
          sawIntakeDenial = true;
        }
      }
    }
    assert.equal(sawIntakeDenial, false, "trusted identity must not trigger conversational intake denial");
  });

  it("Phase 2: LLM customerId cannot override trustedCustomerId for create_booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "99999999-9999-4999-8999-999999999999",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-23",
                  slotStart: "19:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, bookingId: "booking-1", customerId: req.input.customerId },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "2026-08-23 19:00" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking);
    assert.equal(createBooking.input.customerId, "1e6e345e-5180-46fc-9f2b-01f832a6a432");
  });

  it("Phase 2 LIVE failure: trusted + Arabic slot confirm must not ask mobile / must create_booking", async () => {
    const REAL_CUSTOMER = "8b316e71-c338-4f23-a7b5-191f57737caa";
    const FOREIGN_LLM_CUSTOMER = "99999999-9999-4999-8999-999999999999";
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          // Model may no-op; forceCreateBookingIfReady should still book with trusted id.
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        }
        return {
          text: "تمام هأكد الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => [
        "create_customer",
        "create_booking",
        "search_bookings",
        "find_next_available",
        "search_customer",
      ],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-live-1",
              customerId: req.input.customerId,
              customerFacingMessage: "تم تأكيد الحجز.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-live-1",
      trustedCustomerId: REAL_CUSTOMER,
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايزة احجز اقرب معاد متاح مع دكتور Adam" },
          {
            role: "assistant",
            content: "أقرب موعد متاح: اليوم الساعة 07:00 مساءً مع ADAM.",
            toolCalls: [
              {
                id: "call-find-next",
                name: "find_next_available",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-find-next",
            content: JSON.stringify({
              success: true,
              slot: {
                date: todayCairo,
                start: "19:00",
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
                resourceName: "ADAM",
              },
            }),
          },
          {
            role: "user",
            content: "تمام احجز لي الساعة 7 مساء النهاردة مع ADAM",
          },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-live-1",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "search_bookings" } },
      ],
      allowedToolKeys: [
        "create_booking",
        "create_customer",
        "search_bookings",
        "find_next_available",
        "search_customer",
      ],
    });

    assert.doesNotMatch(
      result.response.text,
      /ابعت(?:لي)?\s*رقم\s*(?:ال)?موبايل|ما رقم الهاتف|حجوزاتك السابقة|المسجّل على الحجز/i,
    );
    assert.equal(
      routed.some((entry) => entry.toolKey === "create_customer"),
      false,
      "must not call create_customer when trustedCustomerId is set",
    );
    assert.equal(
      routed.some((entry) => entry.toolKey === "search_bookings"),
      false,
      "create-booking confirm must not hijack into search_bookings",
    );
    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "expected create_booking for trusted Arabic slot confirm");
    assert.equal(createBooking.input.customerId, REAL_CUSTOMER);
    assert.notEqual(createBooking.input.customerId, FOREIGN_LLM_CUSTOMER);
    assert.equal(createBooking.input.date, todayCairo);
    assert.equal(createBooking.input.slotStart, "19:00");
    assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID);
    assert.equal(createBooking.input.resourceId, ADAM_RESOURCE_ID);
  });

  const SUNDAY_OFFER_DATE = "2026-08-23"; // Sunday in Africa/Cairo
  const SUNDAY_OFFER_START = "21:00";
  const FIND_NEXT_FACING =
    "أقرب موعد متاح: الأحد 23 أغسطس 2026 الساعة 09:00 مساءً مع ADAM.";
  const FIND_NEXT_SLOT = {
    date: SUNDAY_OFFER_DATE,
    start: SUNDAY_OFFER_START,
    serviceId: CLINIC_SERVICE_ID,
    resourceId: ADAM_RESOURCE_ID,
    resourceName: "ADAM",
  };

  function findNextHistoryMessages(extraUserTurns: Array<{ role: "user"; content: string }>) {
    return [
      { role: "system" as const, content: SCHEDULING_CATALOG_SYSTEM },
      { role: "user" as const, content: "عايز احجز" },
      { role: "user" as const, content: "عياده" },
      { role: "user" as const, content: "عايز احجز في اقرب معاد" },
      {
        role: "assistant" as const,
        content: FIND_NEXT_FACING,
        toolCalls: [
          {
            id: "call-find-next-offer",
            name: "find_next_available",
            arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
          },
        ],
      },
      {
        role: "tool" as const,
        toolCallId: "call-find-next-offer",
        content: JSON.stringify({
          success: true,
          slot: FIND_NEXT_SLOT,
          customerFacingMessage: FIND_NEXT_FACING,
        }),
      },
      ...extraUserTurns,
    ];
  }

  it("Slot-select A: availability / find_next alone does not create_booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-booking",
                name: "create_booking",
                arguments: {
                  customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: SUNDAY_OFFER_DATE,
                  slotStart: SUNDAY_OFFER_START,
                },
              },
            ],
          };
        }
        return {
          text: "ok",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_booking", "create_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true, bookingId: "should-not-book" },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-a",
      gatewayRequest: {
        messages: findNextHistoryMessages([]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-a", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "find_next_available" } },
      ],
      allowedToolKeys: ["create_booking", "find_next_available", "create_customer"],
    });

    assert.equal(
      routed.some((entry) => entry.toolKey === "create_booking"),
      false,
      "availability alone must not book",
    );
  });

  it("Slot-select B/E/F: الأحد ٩ مساء / الاحد 9 مساء selects offered Sunday 21:00", async () => {
    for (const phrase of ["الأحد ٩ مساء", "الاحد 9 مساء", "الأحد الساعة ٩ مساء"]) {
      const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
      const gateway: RuntimeGatewayPort = {
        async chatCompletion() {
          return {
            text: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        },
      };
      const tools = {
        allowedToolKeys: () => ["create_booking", "create_customer"],
        route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
          routed.push({ toolKey: req.toolKey, input: req.input });
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: { success: true },
            durationMs: 1,
          };
        },
      };

      const loop = new ToolCallLoopService({ gateway, tools });
      const result = await loop.run({
        ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
        conversationId: "conversation-slot-b",
        gatewayRequest: {
          messages: findNextHistoryMessages([{ role: "user", content: phrase }]),
          providerKey: "mock",
          model: "mock-gpt",
          context: { companyId: "company-1", conversationId: "conversation-slot-b", userId: "user-1" },
        },
        tools: [{ type: "function", function: { name: "create_customer" } }],
        allowedToolKeys: ["create_booking", "create_customer"],
      });

      assert.equal(
        routed.some((entry) => entry.toolKey === "create_booking"),
        false,
        `${phrase}: selection without identity must not book yet`,
      );
      assert.match(result.response.text, /اسم|موبايل|هاتف/, `${phrase}: should ask intake`);
    }
  });

  it("Slot-select C/D: selected weekday slot survives name+phone and reaches create_booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "هأكد الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer", "search_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "create_customer") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-weekday-1",
              customerId: req.input.customerId,
              customerFacingMessage: "تم تأكيد الحجز.",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-cd",
      gatewayRequest: {
        messages: findNextHistoryMessages([
          { role: "user", content: "الاحد ٩ مساء" },
          { role: "user", content: "احجز لي" },
          { role: "user", content: "عمر ٠١٠١١٤٠٤١٠٩" },
        ]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-cd", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer", "search_customer"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "name+phone after weekday selection must create_booking");
    assert.equal(createBooking.input.date, SUNDAY_OFFER_DATE);
    assert.equal(createBooking.input.slotStart, SUNDAY_OFFER_START);
    assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID);
    assert.equal(createBooking.input.resourceId, ADAM_RESOURCE_ID);
    assert.equal(createBooking.input.customerId, "1e6e345e-5180-46fc-9f2b-01f832a6a432");
    assert.doesNotMatch(result.response.text, /حجوزاتك السابقة|ابعتلي رقم الموبايل المسجّل/);
  });

  it("Slot-select G: does not duplicate identical find_next customerFacingMessage", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available", "create_booking"],
      route: async () => ({
        toolKey: "find_next_available",
        executionId: "exec-dup",
        status: "succeeded",
        output: {
          success: true,
          slot: FIND_NEXT_SLOT,
          customerFacingMessage: FIND_NEXT_FACING,
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-g",
      gatewayRequest: {
        messages: findNextHistoryMessages([{ role: "user", content: "الاحد ٩ مساء" }]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-g", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "find_next_available" } }],
      allowedToolKeys: ["find_next_available", "create_booking", "create_customer"],
    });

    const occurrences = result.response.text.split(FIND_NEXT_FACING).length - 1;
    assert.ok(occurrences <= 0, "must not re-emit the same أقرب موعد متاح line after selection");
  });

  it("Slot-select H: أقرب موعد تاني still returns new availability", async () => {
    const NEW_FACING = "أقرب موعد متاح: الثلاثاء 25 أغسطس 2026 الساعة 10:00 صباحًا مع ADAM.";
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["find_next_available"],
      route: async () => ({
        toolKey: "find_next_available",
        executionId: "exec-another",
        status: "succeeded",
        output: {
          success: true,
          slot: {
            date: "2026-08-25",
            start: "10:00",
            serviceId: CLINIC_SERVICE_ID,
            resourceId: ADAM_RESOURCE_ID,
            resourceName: "ADAM",
          },
          customerFacingMessage: NEW_FACING,
        },
        durationMs: 1,
      }),
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-h",
      gatewayRequest: {
        messages: findNextHistoryMessages([{ role: "user", content: "أقرب موعد تاني" }]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-h", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "find_next_available" } }],
      allowedToolKeys: ["find_next_available"],
    });

    assert.equal(result.response.text, NEW_FACING);
  });

  it("Slot-select I: حجوزاتي القديمة remains lookup and does not bind offered slot", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "ابعتلي رقم الموبايل",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "create_booking", "create_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-i",
      gatewayRequest: {
        messages: findNextHistoryMessages([{ role: "user", content: "عايز أعرف حجوزاتي القديمة" }]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-i", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_bookings" } }],
      allowedToolKeys: ["search_bookings", "create_booking", "create_customer"],
    });

    assert.equal(routed.some((entry) => entry.toolKey === "create_booking"), false);
    assert.match(result.response.text, /حجوزاتك السابقة|المسجّل على الحجز|موبايل/);
  });

  it("Slot-select J: trustedCustomerId + weekday selection books without create_customer", async () => {
    const TRUSTED = "8b316e71-c338-4f23-a7b5-191f57737caa";
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تم.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            bookingId: "booking-trusted-weekday",
            customerId: req.input.customerId,
            customerFacingMessage: "تم تأكيد الحجز.",
          },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-j",
      trustedCustomerId: TRUSTED,
      gatewayRequest: {
        messages: findNextHistoryMessages([
          { role: "user", content: "الأحد ٩ مساء" },
          { role: "user", content: "احجز لي" },
        ]),
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-slot-j", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "create_customer" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer"],
    });

    assert.equal(routed.some((entry) => entry.toolKey === "create_customer"), false);
    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking);
    assert.equal(createBooking.input.customerId, TRUSTED);
    assert.equal(createBooking.input.date, SUNDAY_OFFER_DATE);
    assert.equal(createBooking.input.slotStart, SUNDAY_OFFER_START);
  });

  it("Slot-retry A–L: SLOT_UNAVAILABLE invalidates 21:00; new availability + الأحد ٩:١٥ books 21:15", async () => {
    const TRUSTED = "8b316e71-c338-4f23-a7b5-191f57737caa";
    const RETRY_SLOTS = ["21:15", "21:30", "21:45"] as const;
    const AVAILABILITY_SUMMARY = [
      "المواعيد المتاحة مع ADAM:",
      "الأحد ٢٣ أغسطس ٢٠٢٦",
      "• 09:15 مساءً",
      "• 09:30 مساءً",
      "• 09:45 مساءً",
    ].join("\n");
    const searchAvailabilityOutput = {
      success: true,
      serviceId: CLINIC_SERVICE_ID,
      resources: [
        {
          resourceId: ADAM_RESOURCE_ID,
          resourceName: "ADAM",
          slots: RETRY_SLOTS.map((start) => ({
            date: SUNDAY_OFFER_DATE,
            start,
          })),
        },
      ],
      customerSummary: AVAILABILITY_SUMMARY,
    };

    function retryHistoryAfterUnavailable(selection: string) {
      return [
        ...findNextHistoryMessages([
          { role: "user" as const, content: "الأحد ٩ مساء" },
          { role: "user" as const, content: "احجز لي" },
        ]),
        {
          role: "assistant" as const,
          content: "",
          toolCalls: [
            {
              id: "call-create-booking-fail",
              name: "create_booking",
              arguments: {
                customerId: TRUSTED,
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
                date: SUNDAY_OFFER_DATE,
                slotStart: SUNDAY_OFFER_START,
              },
            },
          ],
        },
        {
          role: "tool" as const,
          toolCallId: "call-create-booking-fail",
          content: JSON.stringify({
            success: false,
            errorCode: "SLOT_UNAVAILABLE",
            customerFacingMessage: "الموعد ده محجوز أو غير متاح. اختار معاد تاني.",
          }),
        },
        {
          role: "assistant" as const,
          content: AVAILABILITY_SUMMARY,
          toolCalls: [
            {
              id: "call-search-availability-retry",
              name: "search_availability",
              arguments: {
                serviceId: CLINIC_SERVICE_ID,
                resourceId: ADAM_RESOURCE_ID,
                date: SUNDAY_OFFER_DATE,
              },
            },
          ],
        },
        {
          role: "tool" as const,
          toolCallId: "call-search-availability-retry",
          content: JSON.stringify(searchAvailabilityOutput),
        },
        { role: "user" as const, content: selection },
      ];
    }

    async function runRetrySelection(selection: string) {
      const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
      const gateway: RuntimeGatewayPort = {
        async chatCompletion() {
          return {
            text: "تم.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        },
      };
      const tools = {
        allowedToolKeys: () => [
          "create_booking",
          "create_customer",
          "search_availability",
          "search_bookings",
          "booking_search",
        ],
        route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
          routed.push({ toolKey: req.toolKey, input: req.input });
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-retry-2115",
              customerId: req.input.customerId,
              customerFacingMessage: "تم تأكيد الحجز.",
            },
            durationMs: 1,
          };
        },
      };

      const loop = new ToolCallLoopService({ gateway, tools });
      await loop.run({
        ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
        conversationId: "conversation-slot-retry",
        trustedCustomerId: TRUSTED,
        gatewayRequest: {
          messages: retryHistoryAfterUnavailable(selection),
          providerKey: "mock",
          model: "mock-gpt",
          context: {
            companyId: "company-1",
            conversationId: "conversation-slot-retry",
            userId: "user-1",
          },
        },
        tools: [
          { type: "function", function: { name: "create_booking" } },
          { type: "function", function: { name: "create_customer" } },
          { type: "function", function: { name: "search_availability" } },
          { type: "function", function: { name: "search_bookings" } },
        ],
        allowedToolKeys: [
          "create_booking",
          "create_customer",
          "search_availability",
          "search_bookings",
          "booking_search",
        ],
      });
      return routed;
    }

    for (const phrase of ["الأحد ٩:١٥", "الاحد 9:15", "الأحد ٩:١٥ مساءً", "٩:١٥"]) {
      const routed = await runRetrySelection(phrase);
      assert.equal(
        routed.some((entry) => entry.toolKey === "create_customer"),
        false,
        `${phrase}: must not recreate customer when trustedCustomerId exists`,
      );
      assert.equal(
        routed.some((entry) => entry.toolKey === "search_bookings" || entry.toolKey === "booking_search"),
        false,
        `${phrase}: must not search bookings during create retry`,
      );
      const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
      assert.ok(createBooking, `${phrase}: must create_booking after retry selection`);
      assert.equal(createBooking.input.customerId, TRUSTED, `${phrase}: preserve trusted customer`);
      assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID, `${phrase}: service from new offer`);
      assert.equal(createBooking.input.resourceId, ADAM_RESOURCE_ID, `${phrase}: resource from new offer`);
      assert.equal(createBooking.input.date, SUNDAY_OFFER_DATE, `${phrase}: date from new offer`);
      assert.notEqual(createBooking.input.slotStart, SUNDAY_OFFER_START, `${phrase}: failed 21:00 must be invalidated`);
      assert.equal(createBooking.input.slotStart, "21:15", `${phrase}: canonical slot must be 21:15`);
    }

    // Stale "الأحد ٩ مساء" (21:00) must not bind once 21:00 left the post-failure offer set.
    const staleEvening = await runRetrySelection("الأحد ٩ مساء");
    assert.equal(
      staleEvening.some((entry) => entry.toolKey === "create_booking"),
      false,
      "stale 21:00 wording must not book against a post-failure offer set without 21:00",
    );

    const rejected = await runRetrySelection("الأحد ٨ مساء");
    assert.equal(
      rejected.some((entry) => entry.toolKey === "create_booking"),
      false,
      "slot not in latest offer set must not create_booking",
    );
  });

  it("Phase 2: WhatsApp senderName must not become CRM customer name via create_customer", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "أهلاً",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };

    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "senderName=Ahmed From WhatsApp" },
          { role: "user", content: "2026-08-23 19:00" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_customer" } }],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.equal(
      routed.find((entry) => entry.toolKey === "create_customer"),
      undefined,
      "trusted identity must skip create_customer; WhatsApp senderName must not write CRM name",
    );
  });

  it("untrusted intake rejects first-name-only عمر and asks for full name", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        throw new Error(`${req.toolKey} must not run with incomplete full name`);
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز عيادة" },
          {
            role: "assistant",
            content: "المواعيد المتاحة:\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:15 مساءً",
          },
          { role: "user", content: "الأربعاء 09:15 مساء" },
          { role: "user", content: "عمر 01011404109" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.equal(routed.length, 0);
    assert.match(result.response.text, /الاسم الكامل|بالكامل/);
  });

  it("untrusted intake asks full name when only first name عمر is provided without phone", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "شكرًا لك، عمر! الرجاء تزويدي برقم هاتفك لإكمال الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_customer", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        throw new Error(`${req.toolKey} must not run with incomplete full name`);
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const wednesdayOffer = {
      serviceId: CLINIC_SERVICE_ID,
      resourceId: ADAM_RESOURCE_ID,
      date: "2026-08-26",
      slotStart: "21:15",
    };
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-first-name-only",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:15 مساء" },
          {
            role: "assistant",
            content: "المواعيد المتاحة:\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:15 مساءً",
            toolCalls: [
              {
                id: "call-availability",
                name: "search_availability",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-availability",
            content: JSON.stringify({
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [{ resourceId: ADAM_RESOURCE_ID, slots: [wednesdayOffer] }],
            }),
          },
          { role: "user", content: "عمر" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-first-name-only",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_customer", "create_booking"],
    });

    assert.equal(routed.length, 0);
    assert.match(result.response.text, /الاسم الكامل|بالكامل/);
    assert.doesNotMatch(result.response.text, /رقم هاتف|موبايل/);
  });

  it("booking intent with embedded weekday slot binds after availability and completes booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "بنكمل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer", "search_customer"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "create_customer") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              customerId: "603793d2-a65d-4081-989a-e240d33d8df0",
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-embedded-slot",
              confirmationNumber: "BK-000099",
              customerFacingMessage: "تم الحجز بنجاح. رقم الحجز: BK-000099",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const wednesdayOffer = {
      serviceId: CLINIC_SERVICE_ID,
      resourceId: ADAM_RESOURCE_ID,
      date: "2026-08-26",
      slotStart: "21:15",
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-embedded-slot",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:15 مساء" },
          {
            role: "assistant",
            content: "المواعيد المتاحة:\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:15 مساءً",
            toolCalls: [
              {
                id: "call-availability",
                name: "search_availability",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-availability",
            content: JSON.stringify({
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [{ resourceId: ADAM_RESOURCE_ID, slots: [wednesdayOffer] }],
            }),
          },
          { role: "user", content: "عمر عبدالعزيز 01090990200" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-embedded-slot",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer", "search_customer"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "embedded weekday intent must reach create_booking after full name+phone");
    assert.equal(createBooking.input.date, NEXT_CAIRO_WEDNESDAY);
    assert.equal(createBooking.input.slotStart, "21:15");
    assert.match(result.response.text, /BK-000099/);
  });

  it("embedded weekday slot completes booking without tool history in gateway messages", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        const hasCreateCustomer = (input.messages ?? []).some(
          (m) =>
            m.role === "tool" &&
            typeof m.content === "string" &&
            m.content.includes("Customer created successfully"),
        );
        if (input.tools?.length && !hasCreateCustomer) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-customer",
                name: "create_customer",
                arguments: { name: "عمر عبدالعزيز", phone: "01093872555" },
              },
            ],
          };
        }
        return {
          text: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "create_customer") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              customerId: "603793d2-a65d-4081-989a-e240d33d8df0",
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-live-mirror",
              confirmationNumber: "BK-000088",
              customerFacingMessage: "تم الحجز بنجاح. رقم الحجز: BK-000088",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-live-mirror",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "مرحبا" },
          { role: "assistant", content: "أهلاً بك! كيف يمكنني مساعدتك اليوم؟" },
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:15 مساء" },
          {
            role: "assistant",
            content: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز. ممكن تقوليلي الاسم ورقم الموبايل؟",
          },
          { role: "user", content: "عمر" },
          {
            role: "assistant",
            content: "محتاجين الاسم الكامل للعميل (مش الاسم الأول فقط). ممكن تقوليلي الاسم بالكامل؟",
          },
          { role: "user", content: "عمر عبدالعزيز 01093872555" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-live-mirror",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer", "search_availability"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(
      createBooking,
      "must force create_booking when prior search_availability exists only in DB, not gateway history",
    );
    assert.equal(createBooking.input.date, NEXT_CAIRO_WEDNESDAY);
    assert.equal(createBooking.input.slotStart, "21:15");
    assert.match(result.response.text, /BK-000088/);
  });

  it("prior search_availability seed from DB completes booking after create_customer", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        const hasCreateCustomer = (input.messages ?? []).some(
          (m) =>
            m.role === "tool" &&
            typeof m.content === "string" &&
            m.content.includes('"customerId"'),
        );
        if (input.tools?.length && !hasCreateCustomer) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create-customer",
                name: "create_customer",
                arguments: { name: "عمر عبدالعزيز", phone: "01093872555" },
              },
            ],
          };
        }
        return {
          text: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "create_customer") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-create-customer",
            status: "succeeded",
            output: {
              success: true,
              customerId: "603793d2-a65d-4081-989a-e240d33d8df0",
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-create-booking",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-prior-seed",
              confirmationNumber: "BK-000077",
              customerFacingMessage: "تم الحجز بنجاح. رقم الحجز: BK-000077",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: "exec-other",
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-prior-seed",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-search-availability",
          status: "succeeded",
          input: {
            serviceId: CLINIC_SERVICE_ID,
            resourceId: ADAM_RESOURCE_ID,
            date: "2026-08-26",
          },
          output: {
            message:
              "المواعيد المتاحة مع ADAM:\n\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:15 مساءً\n• 09:30 مساءً",
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:15 مساء" },
          {
            role: "assistant",
            content: "محتاجين الاسم الكامل للعميل (مش الاسم الأول فقط). ممكن تقوليلي الاسم بالكامل؟",
          },
          { role: "user", content: "عمر عبدالعزيز 01093872555" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-prior-seed",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_customer" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_booking", "create_customer", "search_availability"],
    });

    const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(createBooking, "prior search_availability seed must bind slot and create booking");
    assert.equal(createBooking.input.date, "2026-08-26");
    assert.equal(createBooking.input.slotStart, "21:15");
    assert.match(result.response.text, /BK-000077/);
  });

  it("does not retry create_booking after same-turn slot_unavailable failure", async () => {
    const routed: Array<{ toolKey: string }> = [];
    let completionCalls = 0;
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        completionCalls += 1;
        if (input.tools?.length && completionCalls === 1) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-book-fail",
                name: "create_booking",
                arguments: {
                  customerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                  date: "2026-08-26",
                  slotStart: "21:15",
                },
              },
            ],
          };
        }
        return {
          text: "ممكن أطلب منك رقم الموبايل الخاص بك؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push({ toolKey: req.toolKey });
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: false,
            errors: ["slot_unavailable", "booking_conflict"],
            customerFacingMessage: "الموعد ده محجوز أو غير متاح. اختار معاد تاني.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-slot-unavailable",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز عيادة الأربعاء 09:15 مساء" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-slot-unavailable",
          userId: "user-1",
        },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking", "search_availability"],
    });

    assert.equal(routed.filter((e) => e.toolKey === "create_booking").length, 1);
    assert.match(result.response.text, /محجوز|غير متاح|معاد تاني|مسجّلة عندنا/);
    assert.doesNotMatch(result.response.text, /رقم الموبايل الخاص/);
  });

  it("trustedCustomerId booking does not ask for full name or phone", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_customer"],
      route: async () => ({
        toolKey: "create_booking",
        executionId: "exec-1",
        status: "succeeded",
        output: {
          success: true,
          reference: "BK-000099",
          customerFacingMessage: "تم الحجز بنجاح. رقم الحجز: BK-000099",
        },
        durationMs: 1,
      }),
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          {
            role: "assistant",
            content: "محتاجين اسم العميل ورقم موبايل العميل عشان نكمّل الحجز.",
          },
          { role: "user", content: "الأربعاء 09:15 مساء" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking", "create_customer"],
    });

    assert.doesNotMatch(result.response.text, /الاسم الكامل|رقم موبايل|اسم العميل/);
  });

  it("trusted bare ألغي lists cancellable bookings before cancel confirmation", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("LLM must not run");
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking", "create_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push(input.toolKey);
        if (input.toolKey === "create_booking") {
          throw new Error("create_booking must not run");
        }
        if (input.toolKey === "cancel_booking") {
          throw new Error("cancel_booking must wait for confirmation after first ألغي");
        }
        return {
          toolKey: "search_bookings",
          executionId: "exec-search",
          status: "succeeded",
          output: {
            success: true,
            purpose: "cancel",
            total: 1,
            bookings: [
              {
                bookingId: "b-future-1",
                reference: "BK-000070",
                status: "confirmed",
                scheduledAt: "2026-08-28T18:00:00.000Z",
              },
            ],
            customerFacingMessage:
              'لقيت 1 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000070\nده الموعد الوحيد. قولّي "ألغي" أو ابعتي رقم الحجز.',
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [{ role: "user", content: "ألغي" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking", "create_booking"],
    });

    assert.deepEqual(routed, ["search_bookings"]);
    assert.match(result.response.text, /BK-000070|ممكن إلغاؤه/);
    assert.doesNotMatch(result.response.text, /تم إلغاء/);
  });

  it("trusted نعم after cancel list cancels the sole eligible booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("LLM must not run");
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: input.toolKey, input: input.input });
        if (input.toolKey === "search_bookings") {
          return {
            toolKey: "search_bookings",
            executionId: "exec-search",
            status: "succeeded",
            output: {
              success: true,
              purpose: "cancel",
              bookings: [
                {
                  bookingId: "b-future-1",
                  reference: "BK-000070",
                  status: "confirmed",
                  scheduledAt: "2026-08-28T18:00:00.000Z",
                },
              ],
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel",
          status: "succeeded",
          output: {
            success: true,
            bookingId: "b-future-1",
            reference: "BK-000070",
            customerFacingMessage: "تم إلغاء الحجز BK-000070 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          {
            role: "assistant",
            content:
              'لقيت 1 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000070\nده الموعد الوحيد. قولّي "ألغي" أو ابعتي رقم الحجز.',
          },
          { role: "user", content: "نعم" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.ok(routed.some((entry) => entry.toolKey === "cancel_booking"));
    assert.match(result.response.text, /تم إلغاء الحجز BK-000070/);
  });

  it("trusted ألغي آخر حجز cancels soonest future eligible booking", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        throw new Error("LLM must not run");
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, input: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: input.toolKey, input: input.input });
        if (input.toolKey === "search_bookings") {
          return {
            toolKey: "search_bookings",
            executionId: "exec-search",
            status: "succeeded",
            output: {
              success: true,
              purpose: "cancel",
              bookings: [
                {
                  bookingId: "later-id",
                  reference: "BK-000080",
                  status: "confirmed",
                  scheduledAt: "2026-08-30T18:00:00.000Z",
                },
                {
                  bookingId: "sooner-id",
                  reference: "BK-000079",
                  status: "confirmed",
                  scheduledAt: "2026-08-28T18:00:00.000Z",
                },
              ],
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: "cancel_booking",
          executionId: "exec-cancel",
          status: "succeeded",
          output: {
            success: true,
            bookingId: input.input.bookingId,
            reference: "BK-000079",
            customerFacingMessage: "تم إلغاء الحجز BK-000079 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-1",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [{ role: "user", content: "ألغي آخر حجز" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-1", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.deepEqual(
      routed.map((entry) => entry.toolKey),
      ["search_bookings", "cancel_booking"],
    );
    assert.equal(routed[1]?.input.bookingId, "sooner-id");
    assert.match(result.response.text, /BK-000079/);
  });

  it("WA regression: bare حجز / عايز حجز variants deny search_bookings and cancel_booking", async () => {
    const phrases = ["حجز", "عايز حجز", "عايز احجز", "محتاج احجز", "احجزلي", "انا عايز احجزززز"];
    for (const phrase of phrases) {
      const routed: string[] = [];
      const gateway: RuntimeGatewayPort = {
        async chatCompletion(input) {
          if (input.tools?.length) {
            return {
              text: "",
              model: "mock-gpt",
              providerKey: "mock",
              finishReason: "tool_calls",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              latencyMs: 1,
              toolCalls: [
                {
                  id: "call-search",
                  name: "search_bookings",
                  arguments: { purpose: "cancel" },
                },
                {
                  id: "call-cancel",
                  name: "cancel_booking",
                  arguments: { bookingReference: "حجز" },
                },
              ],
            };
          }
          return {
            text: "تمام، هعرضلك المواعيد المتاحة.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        },
      };
      const tools = {
        allowedToolKeys: () => [
          "search_bookings",
          "cancel_booking",
          "search_availability",
          "create_booking",
        ],
        route: async (_ctx: unknown, req: { toolKey: string }) => {
          routed.push(req.toolKey);
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: false,
              customerFacingMessage: "ما لقيناش الحجز ده. تأكدي من رقم الحجز.",
            },
            durationMs: 1,
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
        conversationId: `conversation-create-intent-${phrase}`,
        trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
        gatewayRequest: {
          messages: [
            {
              role: "assistant",
              content: "لقيت 1 موعد ممكن إلغاؤه:\n1) رقم الحجز: BK-000033\nقولّي أنهي موعد تلغي؟",
            },
            { role: "user", content: phrase },
          ],
          providerKey: "mock",
          model: "mock-gpt",
          context: {
            companyId: "company-1",
            conversationId: `conversation-create-intent-${phrase}`,
            userId: "user-1",
          },
        },
        tools: [
          { type: "function", function: { name: "search_bookings" } },
          { type: "function", function: { name: "cancel_booking" } },
          { type: "function", function: { name: "search_availability" } },
        ],
        allowedToolKeys: [
          "search_bookings",
          "cancel_booking",
          "search_availability",
          "create_booking",
        ],
      });

      assert.equal(
        routed.includes("search_bookings"),
        false,
        `${phrase}: must not execute search_bookings`,
      );
      assert.equal(
        routed.includes("cancel_booking"),
        false,
        `${phrase}: must not execute cancel_booking`,
      );
      assert.doesNotMatch(
        result.response.text,
        /ما لقيناش الحجز ده|تأكدي من رقم الحجز/,
        `${phrase}: must not surface cancel-not-found copy`,
      );
    }
  });

  it("WA regression: النهارده الساعة 9 / 9 مساء binds offered evening slot and creates booking", async () => {
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const offerFacing =
      "المواعيد المتاحة مع ADAM:\n\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:00 مساءً\n• 09:45 مساءً";
    const phrases = ["النهارده الساعة 9", "النهارده الساعه ٩", "الساعة 9", "9 مساء"];

    for (const phrase of phrases) {
      const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
      const gateway: RuntimeGatewayPort = {
        async chatCompletion() {
          return {
            text: "محتاجين اسم العميل.",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "stop",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
          };
        },
      };
      const tools = {
        allowedToolKeys: () => ["create_booking", "search_availability", "create_customer"],
        route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
          routed.push({ toolKey: req.toolKey, input: req.input });
          return {
            toolKey: req.toolKey,
            executionId: `exec-${routed.length}`,
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-wa-slot-210",
              reference: "BK-000210",
              customerFacingMessage: "تم حجز موعدك بنجاح.\nرقم الحجز: BK-000210",
            },
            durationMs: 1,
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
        conversationId: `conversation-slot-today-${phrase}`,
        trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
        gatewayRequest: {
          messages: [
            { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
            { role: "user", content: "حجز" },
            {
              role: "assistant",
              content: offerFacing,
              toolCalls: [
                {
                  id: "call-avail-today",
                  name: "search_availability",
                  arguments: {
                    serviceId: CLINIC_SERVICE_ID,
                    resourceId: ADAM_RESOURCE_ID,
                    date: todayCairo,
                  },
                },
              ],
            },
            {
              role: "tool",
              toolCallId: "call-avail-today",
              content: JSON.stringify({
                success: true,
                serviceId: CLINIC_SERVICE_ID,
                resources: [
                  {
                    resourceId: ADAM_RESOURCE_ID,
                    slots: [
                      { date: todayCairo, start: "21:00" },
                      { date: todayCairo, start: "21:45" },
                    ],
                  },
                ],
                customerSummary: offerFacing,
              }),
            },
            { role: "user", content: phrase },
          ],
          providerKey: "mock",
          model: "mock-gpt",
          context: {
            companyId: "company-1",
            conversationId: `conversation-slot-today-${phrase}`,
            userId: "user-1",
          },
        },
        tools: [{ type: "function", function: { name: "create_booking" } }],
        allowedToolKeys: ["create_booking", "search_availability", "create_customer"],
      });

      const createBooking = routed.find((entry) => entry.toolKey === "create_booking");
      assert.ok(createBooking, `${phrase}: expected create_booking`);
      assert.equal(createBooking.input.date, todayCairo, `${phrase}: date`);
      assert.equal(createBooking.input.slotStart, "21:00", `${phrase}: evening slot`);
      assert.equal(createBooking.input.serviceId, CLINIC_SERVICE_ID);
      assert.equal(createBooking.input.resourceId, ADAM_RESOURCE_ID);
      assert.match(result.response.text, /BK-000210|تم حجز/);
    }
  });

  it("WA regression: unavailable slot selection does not cancel or lose create intent", async () => {
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const offerFacing =
      "المواعيد المتاحة مع ADAM:\n\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:00 مساءً\n• 09:45 مساءً";
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-search",
                name: "search_bookings",
                arguments: { purpose: "cancel" },
              },
            ],
          };
        }
        return {
          text: "الموعد الساعة 10 مساءً مش ضمن المواعيد المتاحة. اختار من 09:00 أو 09:45 مساءً.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "create_booking", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: { success: true },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-unavailable-slot",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "حجز" },
          {
            role: "assistant",
            content: offerFacing,
            toolCalls: [
              {
                id: "call-avail",
                name: "search_availability",
                arguments: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID },
              },
            ],
          },
          {
            role: "tool",
            toolCallId: "call-avail",
            content: JSON.stringify({
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [
                {
                  resourceId: ADAM_RESOURCE_ID,
                  slots: [
                    { date: todayCairo, start: "21:00" },
                    { date: todayCairo, start: "21:45" },
                  ],
                },
              ],
              customerSummary: offerFacing,
            }),
          },
          { role: "user", content: "النهارده الساعة 10 مساء" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-unavailable-slot",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "create_booking", "search_availability"],
    });

    assert.equal(routed.includes("search_bookings"), false);
    assert.equal(routed.includes("create_booking"), false);
    assert.doesNotMatch(result.response.text, /ما لقيناش الحجز|تم إلغاء/);
  });

  it("WA regression: bare ايوه without cancel list does not force cancel lookup", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، قولي عايز تحجز ولا حاجة تانية؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${routed.length}`,
          status: "succeeded",
          output: {
            success: true,
            customerFacingMessage: "مفيش مواعيد قابلة للإلغاء على الرقم ده حالياً.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-bare-yes",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "assistant", content: "هل تود الحجز لموعد؟" },
          { role: "user", content: "ايوه" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-bare-yes",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });

    assert.deepEqual(routed, []);
    assert.doesNotMatch(result.response.text, /قابلة للإلغاء|تم إلغاء/);
  });

  it("bare حجز after a stale past slot does not create_booking and searches availability", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-create",
                name: "create_booking",
                arguments: {
                  date: "2026-08-26",
                  slotStart: "21:45",
                  serviceId: CLINIC_SERVICE_ID,
                  resourceId: ADAM_RESOURCE_ID,
                },
              },
            ],
          };
        }
        return {
          text: "تمام، هعرضلك المواعيد المتاحة.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "create_booking", "search_bookings"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "search_availability") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-search-availability",
            status: "succeeded",
            output: {
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              message: "المواعيد المتاحة مع ADAM:\n\nالخميس ٢٧ أغسطس ٢٠٢٦\n• 07:00 صباحًا\n• 07:15 صباحًا",
              customerSummary: "المواعيد المتاحة مع ADAM:\n\nالخميس ٢٧ أغسطس ٢٠٢٦\n• 07:00 صباحًا",
            },
            durationMs: 1,
          };
        }
        throw new Error(`unexpected tool ${req.toolKey}`);
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-fresh-hajz",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-search-availability",
          status: "succeeded",
          input: { serviceId: CLINIC_SERVICE_ID, resourceId: ADAM_RESOURCE_ID, date: "2026-08-26" },
          output: {
            success: true,
            message: "المواعيد المتاحة مع ADAM:\n\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:00 مساءً\n• 09:45 مساءً",
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "assistant", content: "المواعيد المتاحة مع ADAM:\n\nالأربعاء ٢٦ أغسطس ٢٠٢٦\n• 09:00 مساءً\n• 09:45 مساءً" },
          { role: "user", content: "09:45 مساء" },
          { role: "assistant", content: "الموعد ده محجوز أو غير متاح. اختار معاد تاني." },
          { role: "user", content: "حجز" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-fresh-hajz", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "search_bookings" } },
      ],
      allowedToolKeys: ["search_availability", "create_booking", "search_bookings"],
    });

    assert.equal(routed.some((entry) => entry.toolKey === "create_booking"), false);
    assert.equal(routed.some((entry) => entry.toolKey === "search_bookings"), false);
    assert.equal(routed.some((entry) => entry.toolKey === "search_availability"), true);
    assert.doesNotMatch(result.response.text, /BK-|حجوزات مسجّلة|09:45/);
  });

  it("عايز احجز بكره الساعة 7 الصبح resolves Cairo tomorrow 07:00", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [year, month, day] = todayCairo.split("-").map(Number);
    const tomorrowCairo = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "search_availability") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-search-tomorrow",
            status: "succeeded",
            output: {
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [
                {
                  resourceId: ADAM_RESOURCE_ID,
                  slots: [{ date: tomorrowCairo, start: "07:00" }],
                },
              ],
              message: `المواعيد المتاحة مع ADAM:\n\n• 07:00 صباحًا`,
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-create-tomorrow",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-tomorrow-7",
              confirmationNumber: "BK-000199",
              customerFacingMessage: "تم حجز موعدك بنجاح.\nرقم الحجز: BK-000199",
            },
            durationMs: 1,
          };
        }
        throw new Error(`unexpected tool ${req.toolKey}`);
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-bokrah",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-bokrah", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_availability", "create_booking"],
    });

    const search = routed.find((entry) => entry.toolKey === "search_availability");
    assert.ok(search, "must search availability for tomorrow 07:00");
    assert.equal(search.input.date, tomorrowCairo);
    const create = routed.find((entry) => entry.toolKey === "create_booking");
    assert.ok(create, "must create the requested tomorrow 07:00 slot when available");
    assert.equal(create.input.date, tomorrowCairo);
    assert.equal(create.input.slotStart, "07:00");
    assert.match(result.response.text, /BK-000199/);
  });

  it("بكره 07:00 searches tomorrow and does not ask trusted customers for name when 07:00 is unoffered", async () => {
    const routed: Array<{ toolKey: string; input: Record<string, unknown> }> = [];
    const todayCairo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [year, month, day] = todayCairo.split("-").map(Number);
    const tomorrowCairo = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "الموعد الساعة 7 الصبح غير متاح. أقرب وقت بكره 07:15.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "search_availability") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-search",
            status: "succeeded",
            output: {
              success: true,
              serviceId: CLINIC_SERVICE_ID,
              resources: [
                {
                  resourceId: ADAM_RESOURCE_ID,
                  resourceName: "ADAM",
                  slots: [{ date: tomorrowCairo, start: "07:15", end: "07:45" }],
                },
              ],
            },
            durationMs: 1,
          };
        }
        if (req.toolKey === "create_booking") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-create",
            status: "succeeded",
            output: {
              success: true,
              bookingId: "booking-715",
              confirmationNumber: "BK-000215",
              customerFacingMessage: "تم حجز موعدك بنجاح.\nرقم الحجز: BK-000215",
            },
            durationMs: 1,
          };
        }
        throw new Error(`unexpected tool ${req.toolKey}`);
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-bokrah-unoffered",
      trustedCustomerId: "8b810114-c2fe-4a30-bc65-cf4bf084d1fb",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-bokrah-unoffered", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["search_availability", "create_booking"],
    });
    const search = routed.find((entry) => entry.toolKey === "search_availability");
    assert.ok(search);
    assert.equal(search.input.date, tomorrowCairo);
    const create = routed.find((entry) => entry.toolKey === "create_booking");
    if (create) {
      assert.equal(create.input.date, tomorrowCairo);
      assert.ok(["07:00", "07:15"].includes(String(create.input.slotStart)));
    }
    assert.doesNotMatch(result.response.text, /اسم العميل ورقم موبايل/);
  });

  it("does not overwrite a ticket reply with booking name intake", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تم فتح الشكوى رقم TKT-000088",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_ticket", "search_availability", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => ({
        toolKey: req.toolKey,
        executionId: `exec-${req.toolKey}`,
        status: "succeeded",
        output: {
          success: true,
          ticketNumber: "TKT-000088",
          customerFacingMessage: "تم فتح الشكوى رقم TKT-000088",
        },
        durationMs: 1,
      }),
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-ticket-after-slot",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
          { role: "assistant", content: "المواعيد المتاحة مع ADAM:\n- 2026-08-27: 07:15, 07:30" },
          { role: "user", content: "عايز أفتح شكوى" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-ticket-after-slot", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_ticket" } }],
      allowedToolKeys: ["create_ticket", "search_availability", "create_booking"],
    });
    assert.doesNotMatch(result.response.text, /اسم العميل ورقم موبايل/);
    assert.match(result.response.text, /TKT-000088/);
  });

  it("does not replace a full-name intake turn with the availability list", async () => {
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "تمام، سجلنا الاسم. ابعت رقم الموبايل.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_availability", "create_booking"],
      route: async () => ({
        toolKey: "search_availability",
        executionId: "exec-search",
        status: "succeeded",
        output: {
          success: true,
          customerSummary: "المواعيد المتاحة مع ADAM:\n\nالخميس ٢٧ أغسطس ٢٠٢٦\n• 07:15 صباحًا",
        },
        durationMs: 1,
      }),
    };
    const loop = new ToolCallLoopService({
      gateway,
      tools,
    });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-fullname",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-search",
          status: "succeeded",
          output: {
            success: true,
            customerSummary: "المواعيد المتاحة مع ADAM:\n\nالخميس ٢٧ أغسطس ٢٠٢٦\n• 07:15 صباحًا",
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز" },
          { role: "assistant", content: "المواعيد المتاحة مع ADAM:\n• 07:15 صباحًا" },
          { role: "user", content: "محمد أحمد علي التجريبي" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-fullname", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "search_availability" } }],
      allowedToolKeys: ["search_availability", "create_booking"],
    });
    assert.doesNotMatch(result.response.text, /المواعيد المتاحة مع ADAM/);
    assert.match(result.response.text, /سجلنا الاسم|موبايل/);
  });

  it("does not create_ticket when the user says عايز احجز then tomorrow 7am", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-ticket",
                name: "create_ticket",
                arguments: { subject: "حجز موعد", description: "عايز احجز بكره الساعة 7 الصبح" },
              },
            ],
          };
        }
        return {
          text: "هبحث عن المواعيد المتاحة.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_ticket", "search_availability", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${req.toolKey}`,
          status: "succeeded",
          output: { success: true, ticketNumber: "TKT-SHOULD-NOT" },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-no-ticket",
      trustedCustomerId: "cust-trusted",
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "assistant", content: "أقرب موعد متاح بكره 07:00." },
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-no-ticket", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_ticket" } },
        { type: "function", function: { name: "search_availability" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_ticket", "search_availability", "create_booking"],
    });
    assert.equal(routed.includes("create_ticket"), false);
    assert.doesNotMatch(result.response.text, /TKT-/);
  });

  it("still creates a ticket for explicit complaint intent", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [{ id: "call-ticket", name: "create_ticket", arguments: { subject: "شكوى تأخير" } }],
          };
        }
        return {
          text: "تم فتح الشكوى رقم TKT-000077",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_ticket"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: "exec-ticket",
          status: "succeeded",
          output: {
            success: true,
            ticketNumber: "TKT-000077",
            customerFacingMessage: "تم فتح الشكوى رقم TKT-000077",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-ticket",
      trustedCustomerId: "cust-trusted",
      gatewayRequest: {
        messages: [{ role: "user", content: "عايز أفتح شكوى" }],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-ticket", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_ticket" } }],
      allowedToolKeys: ["create_ticket"],
    });
    assert.equal(routed.includes("create_ticket"), true);
    assert.match(result.response.text, /TKT-000077/);
  });

  it("explicit ticket intent does not force create_booking from leftover availability", async () => {
    const routed: string[] = [];
    const clinicServiceId = "a8a6403e-4c88-48ae-aa46-d204ea8ef49d";
    const adamResourceId = "1c766372-7726-4cb6-b660-b88ae85fb49c";
    const gateway: RuntimeGatewayPort = {
      async chatCompletion(input) {
        if (input.tools?.length) {
          const names = (input.tools ?? []).map((tool) =>
            "function" in tool ? tool.function?.name : undefined,
          );
          if (names.includes("create_ticket")) {
            return {
              text: "",
              model: "mock-gpt",
              providerKey: "mock",
              finishReason: "tool_calls",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              latencyMs: 1,
              toolCalls: [{ id: "call-ticket", name: "create_ticket", arguments: { subject: "شكوى" } }],
            };
          }
          return {
            text: "",
            model: "mock-gpt",
            providerKey: "mock",
            finishReason: "tool_calls",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            latencyMs: 1,
            toolCalls: [
              {
                id: "call-book",
                name: "create_booking",
                arguments: {
                  serviceId: clinicServiceId,
                  resourceId: adamResourceId,
                  date: cairoCalendarYmd(1),
                  slotStart: "07:00",
                },
              },
            ],
          };
        }
        return {
          text: "تم فتح الشكوى رقم TKT-000099",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_ticket", "create_booking", "search_availability"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        if (req.toolKey === "create_ticket") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-ticket",
            status: "succeeded",
            output: {
              success: true,
              ticketNumber: "TKT-000099",
              customerFacingMessage: "تم فتح الشكوى رقم TKT-000099",
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: `exec-${req.toolKey}`,
          status: "succeeded",
          output: { success: true, confirmationNumber: "BK-SHOULD-NOT" },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-ticket-after-slot",
      trustedCustomerId: "7285bfa4-bfd4-496f-b5fb-1c3a99511925",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-avail",
          status: "succeeded",
          input: { serviceId: clinicServiceId, resourceId: adamResourceId, date: cairoCalendarYmd(1) },
          output: {
            success: true,
            serviceId: clinicServiceId,
            resources: [{ resourceId: adamResourceId, slots: [{ date: cairoCalendarYmd(1), slotStart: "07:15" }] }],
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "system", content: SCHEDULING_CATALOG_SYSTEM },
          { role: "user", content: "عايز احجز" },
          { role: "assistant", content: "المواعيد المتاحة مع ADAM:\n• 07:15 صباحًا" },
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
          { role: "assistant", content: "اختَر أو أكّد المعاد المناسب من المواعيد المتاحة." },
          { role: "user", content: "عايز أفتح شكوى" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: {
          companyId: "company-1",
          conversationId: "conversation-ticket-after-slot",
          userId: "user-1",
        },
      },
      tools: [
        { type: "function", function: { name: "create_ticket" } },
        { type: "function", function: { name: "create_booking" } },
        { type: "function", function: { name: "search_availability" } },
      ],
      allowedToolKeys: ["create_ticket", "create_booking", "search_availability"],
    });
    assert.equal(routed.includes("create_booking"), false);
    assert.equal(routed.includes("create_ticket"), true);
    assert.match(result.response.text, /TKT-000099/);
  });

  it("forces create_ticket when explicit complaint only asks for details", async () => {
    const routed: string[] = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "ما هي تفاصيل الشكوى التي تود تقديمها؟",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_ticket", "create_booking"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: "exec-forced-ticket",
          status: "succeeded",
          output: {
            success: true,
            ticketNumber: "TKT-000103",
            customerFacingMessage: "تم فتح التذكرة بنجاح.\nرقم التذكرة: TKT-000103",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-force-ticket",
      trustedCustomerId: "7285bfa4-bfd4-496f-b5fb-1c3a99511925",
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
          { role: "assistant", content: "الموعد غير متوفر. اختار معاد تاني." },
          { role: "user", content: "عايز أفتح شكوى" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-force-ticket", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "create_ticket" } },
        { type: "function", function: { name: "create_booking" } },
      ],
      allowedToolKeys: ["create_ticket", "create_booking"],
    });
    assert.equal(routed.includes("create_booking"), false);
    assert.equal(routed.includes("create_ticket"), true);
    assert.match(result.response.text, /TKT-000103/);
  });

  it("does not force create_booking from leftover slot on a non-booking follow-up", async () => {
    const routed: string[] = [];
    const clinicServiceId = "a8a6403e-4c88-48ae-aa46-d204ea8ef49d";
    const adamResourceId = "1c766372-7726-4cb6-b660-b88ae85fb49c";
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "حاضر.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "create_ticket"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${req.toolKey}`,
          status: "succeeded",
          output: { success: true, confirmationNumber: "BK-SHOULD-NOT", ticketNumber: "TKT-SHOULD-NOT" },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-no-force-followup",
      trustedCustomerId: "7285bfa4-bfd4-496f-b5fb-1c3a99511925",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-avail",
          status: "succeeded",
          input: { serviceId: clinicServiceId, resourceId: adamResourceId, date: cairoCalendarYmd(0) },
          output: {
            success: true,
            serviceId: clinicServiceId,
            resources: [{ resourceId: adamResourceId, slots: [{ date: cairoCalendarYmd(0), start: "07:15" }] }],
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايز احجز بكره الساعة 7 الصبح" },
          { role: "assistant", content: "الموعد غير متوفر." },
          { role: "user", content: "idem-123" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-no-force-followup", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking", "create_ticket"],
    });
    assert.equal(routed.includes("create_booking"), false);
    assert.equal(routed.includes("create_ticket"), false);
  });

  it("status lookup with BK reference must not call cancel_booking", async () => {
    const routed: Array<{ toolKey: string; input?: Record<string, unknown> }> = [];
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["search_bookings", "cancel_booking"],
      route: async (_ctx: unknown, req: { toolKey: string; input: Record<string, unknown> }) => {
        routed.push({ toolKey: req.toolKey, input: req.input });
        if (req.toolKey === "search_bookings") {
          return {
            toolKey: req.toolKey,
            executionId: "exec-search",
            status: "succeeded",
            output: {
              success: true,
              bookings: [
                {
                  reference: "BK-000088",
                  status: "confirmed",
                  scheduledAt: "2026-08-28T07:15:00+03:00",
                },
              ],
            },
            durationMs: 1,
          };
        }
        return {
          toolKey: req.toolKey,
          executionId: "exec-cancel",
          status: "succeeded",
          output: {
            success: true,
            reference: "BK-000088",
            customerFacingMessage: "تم إلغاء الحجز BK-000088 بنجاح.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    const result = await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-status-bk",
      trustedCustomerId: "7285bfa4-bfd4-496f-b5fb-1c3a99511925",
      gatewayRequest: {
        messages: [
          { role: "user", content: "01039399960" },
          { role: "user", content: "عايزة أعرف حالة الحجز BK-000088" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-status-bk", userId: "user-1" },
      },
      tools: [
        { type: "function", function: { name: "search_bookings" } },
        { type: "function", function: { name: "cancel_booking" } },
      ],
      allowedToolKeys: ["search_bookings", "cancel_booking"],
    });
    assert.equal(routed.some((entry) => entry.toolKey === "cancel_booking"), false);
    assert.equal(routed.some((entry) => entry.toolKey === "search_bookings"), true);
    assert.match(result.response.text, /BK-000088/);
    assert.match(result.response.text, /الحالة:/);
    assert.doesNotMatch(result.response.text, /تم إلغاء/);
  });

  it("ليه؟ must not force create_booking from stale scheduling seed", async () => {
    const routed: string[] = [];
    const clinicServiceId = "a8a6403e-4c88-48ae-aa46-d204ea8ef49d";
    const adamResourceId = "1c766372-7726-4cb6-b660-b88ae85fb49c";
    const gateway: RuntimeGatewayPort = {
      async chatCompletion() {
        return {
          text: "حالة الحجز الحالية مش بتسمح بتغيير الميعاد.",
          model: "mock-gpt",
          providerKey: "mock",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          latencyMs: 1,
        };
      },
    };
    const tools = {
      allowedToolKeys: () => ["create_booking", "search_bookings"],
      route: async (_ctx: unknown, req: { toolKey: string }) => {
        routed.push(req.toolKey);
        return {
          toolKey: req.toolKey,
          executionId: `exec-${req.toolKey}`,
          status: "succeeded",
          output: {
            success: true,
            confirmationNumber: "BK-000088",
            customerFacingMessage: "تم حجز موعدك بنجاح.",
          },
          durationMs: 1,
        };
      },
    };
    const loop = new ToolCallLoopService({ gateway, tools });
    await loop.run({
      ctx: { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true },
      conversationId: "conversation-leh-no-create",
      trustedCustomerId: "7285bfa4-bfd4-496f-b5fb-1c3a99511925",
      priorSchedulingToolExecutions: [
        {
          toolKey: "search_availability",
          executionId: "prior-avail",
          status: "succeeded",
          input: { serviceId: clinicServiceId, resourceId: adamResourceId, date: cairoCalendarYmd(1) },
          output: {
            success: true,
            serviceId: clinicServiceId,
            resources: [{ resourceId: adamResourceId, slots: [{ date: cairoCalendarYmd(1), start: "07:00" }] }],
          },
          durationMs: 0,
        },
      ],
      gatewayRequest: {
        messages: [
          { role: "user", content: "عايزة أغير الميعاد" },
          { role: "assistant", content: "حالة الحجز الحالية مش بتسمح بتغيير الميعاد." },
          { role: "user", content: "ليه؟" },
        ],
        providerKey: "mock",
        model: "mock-gpt",
        context: { companyId: "company-1", conversationId: "conversation-leh-no-create", userId: "user-1" },
      },
      tools: [{ type: "function", function: { name: "create_booking" } }],
      allowedToolKeys: ["create_booking", "search_bookings"],
    });
    assert.equal(routed.includes("create_booking"), false);
  });

});
