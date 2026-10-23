import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolCallLoopService } from "./tool-call-loop-service.js";
import type { RuntimeGatewayPort } from "../ports/runtime-ports.js";

const CUSTOMER_ID = "8b810114-c2fe-4a30-bc65-cf4bf084d1fb";
const DENTAL_ID = "51515151-1111-4111-8111-111111111111";
const ADAM_ID = "54545454-4444-4444-8444-444444444444";
const ctx = { userId: "user-1", companyId: "company-1", isSuperAdmin: false, hasPermission: () => true };

function futureIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function booking(reference: string, days: number) {
  return {
    bookingId: `id-${reference}`,
    customerId: CUSTOMER_ID,
    customerName: "Omar",
    reference,
    scheduledAt: futureIso(days),
    timezone: "Africa/Cairo",
    status: "confirmed",
    employeeName: "ADAM",
    serviceName: "اسنان",
    resourceId: ADAM_ID,
    serviceId: DENTAL_ID,
  };
}

type History = Array<{ role: "user" | "assistant"; content: string }>;

function loop(options: {
  history: History;
  bookings?: unknown[];
  reschedule?: Record<string, unknown>;
  cancel?: Record<string, unknown>;
  modelText?: string;
  allowed?: string[];
  trusted?: boolean;
}) {
  const routed: string[] = [];
  const allowed = options.allowed ?? ["search_bookings", "search_availability", "reschedule_booking", "cancel_booking"];
  const gateway: RuntimeGatewayPort = {
    async chatCompletion() {
      return {
        text: options.modelText ?? "Noted.",
        model: "mock",
        providerKey: "mock",
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
      };
    },
  };
  const service = new ToolCallLoopService({
    gateway,
    tools: {
      allowedToolKeys: () => allowed,
      route: async (_ctx, request) => {
        routed.push(request.toolKey);
        if (request.toolKey === "search_bookings") {
          return {
            toolKey: request.toolKey,
            executionId: "exec-search",
            status: "succeeded" as const,
            durationMs: 1,
            output: {
              success: true,
              purpose: request.input?.purpose ?? "list",
              bookings: options.bookings ?? [booking("BK-000097", 4), booking("BK-000095", 2)],
              customerFacingMessage: "لقيت 2 موعد ممكن إلغاؤه. قولّي أنهي موعد تلغي؟",
            },
          };
        }
        if (request.toolKey === "search_availability") {
          return {
            toolKey: request.toolKey,
            executionId: "exec-availability",
            status: "succeeded" as const,
            durationMs: 1,
            output: {
              success: true,
              resources: [
                {
                  resourceName: "ADAM",
                  slots: [
                    { date: "2026-10-20", start: "11:00" },
                    { date: "2026-10-20", start: "14:30" },
                    { date: "2026-10-21", start: "09:00" },
                  ],
                },
              ],
            },
          };
        }
        if (request.toolKey === "cancel_booking") {
          return {
            toolKey: request.toolKey,
            executionId: "exec-cancel",
            status: options.cancel?.success === false ? ("failed" as const) : ("succeeded" as const),
            durationMs: 1,
            output: {
              success: options.cancel?.success !== false,
              reference: "BK-000097",
              customerFacingMessage: "تم إلغاء الحجز BK-000097 بنجاح.",
              ...options.cancel,
            },
          };
        }
        return {
          toolKey: request.toolKey,
          executionId: "exec-reschedule",
          status: options.reschedule?.success === false ? ("failed" as const) : ("succeeded" as const),
          durationMs: 1,
          output: {
            success: options.reschedule?.success !== false,
            reference: request.input?.bookingReference,
            customerFacingMessage: "تم تغيير ميعاد الحجز بنجاح.",
            ...options.reschedule,
          },
        };
      },
    },
  });
  return service
    .run({
      ctx,
      conversationId: "conversation-change-language",
      ...(options.trusted === false ? {} : { trustedCustomerId: CUSTOMER_ID }),
      gatewayRequest: {
        messages: options.history,
        providerKey: "mock",
        model: "mock",
        context: { companyId: "company-1", conversationId: "conversation-change-language", userId: "user-1" },
      },
      tools: allowed.map((name) => ({ type: "function", function: { name } })),
      allowedToolKeys: allowed,
    })
    .then((result) => ({ text: result.response.text, routed }));
}

describe("reschedule and cancel replies follow the customer language", () => {
  it("continues an Arabic reschedule in Arabic and does not move the booking before confirmation", async () => {
    const result = await loop({
      history: [{ role: "user", content: "عايز أغير ميعاد الحجز" }],
    });
    assert.deepEqual(result.routed, ["search_bookings"]);
    assert.match(result.text, /أنهي حجز عايز تغيّر ميعاده؟/);
    assert.equal(result.text.includes("Which booking"), false);
  });

  it("continues an English reschedule in English", async () => {
    const result = await loop({
      history: [{ role: "user", content: "I want to reschedule my booking" }],
    });
    assert.deepEqual(result.routed, ["search_bookings"]);
    assert.match(result.text, /Which booking should I reschedule\?/);
    assert.equal(result.text.includes("أنهي حجز"), false);
  });

  it("continues a German reschedule in German", async () => {
    const result = await loop({
      history: [{ role: "user", content: "Ich möchte meinen Termin verschieben" }],
    });
    assert.deepEqual(result.routed, ["search_bookings"]);
    assert.match(result.text, /Welche Buchung möchtest du verschieben\?/);
    assert.equal(result.text.includes("أنهي حجز"), false);
  });

  it("switches to the latest clear language during a reschedule", async () => {
    const result = await loop({
      history: [
        { role: "user", content: "عايز أغير ميعاد الحجز" },
        { role: "assistant", content: "أنهي حجز عايز تغيّر ميعاده؟" },
        { role: "user", content: "I want to reschedule my booking" },
      ],
    });
    assert.match(result.text, /Which booking should I reschedule\?/);
    assert.equal(result.routed.includes("reschedule_booking"), false);
  });

  it("keeps the current language when the reply is OK or a customer name", async () => {
    const ok = await loop({
      history: [
        { role: "user", content: "Ich möchte meinen Termin verschieben" },
        {
          role: "assistant",
          content: "Ich habe deine Buchung BK-000097 gefunden:\nاسنان bei ADAM\nIst das die Buchung, deren Termin du verschieben möchtest?",
        },
        { role: "user", content: "OK" },
      ],
    });
    assert.match(ok.text, /Wähle eine Tagesnummer/);
    assert.equal(ok.text.includes("اختار رقم اليوم"), false);
    assert.equal(ok.routed.includes("reschedule_booking"), false);

    const name = await loop({
      history: [
        { role: "user", content: "I want to reschedule my booking" },
        { role: "assistant", content: "Which booking should I reschedule?" },
        { role: "user", content: "Müller" },
      ],
    });
    assert.equal(/[\u0600-\u06FF]/.test(name.text), false);
    assert.equal(name.text.includes("Buchung"), false);
    assert.equal(name.text.includes("möchtest"), false);
  });

  it("says when there is no upcoming booking to reschedule", async () => {
    const result = await loop({
      history: [{ role: "user", content: "I want to reschedule my booking" }],
      bookings: [],
    });
    assert.match(result.text, /You don't have an upcoming booking I can reschedule/);
    assert.equal(result.routed.includes("reschedule_booking"), false);
  });

  it("asks which booking when more than one can be rescheduled", async () => {
    const result = await loop({
      history: [{ role: "user", content: "Please reschedule my booking" }],
    });
    assert.match(result.text, /BK-000097/);
    assert.match(result.text, /BK-000095/);
    assert.match(result.text, /Which booking should I reschedule\?/);
    assert.equal(result.routed.includes("reschedule_booking"), false);
  });

  it("rejects a time that is not open and does not claim the booking moved", async () => {
    const result = await loop({
      history: [
        { role: "user", content: "I want to reschedule my booking" },
        {
          role: "assistant",
          content: "Open times on 2026-10-20 for booking BK-000097:\n1) 2026-10-20 11:00\n2) 2026-10-20 14:30\nChoose the new time number",
        },
        { role: "user", content: "15:00" },
      ],
    });
    assert.match(result.text, /That time is not available/);
    assert.equal(result.routed.includes("reschedule_booking"), false);
    assert.equal(result.text.includes("has been rescheduled"), false);
  });

  it("confirms an English reschedule in English after the tool returns Arabic", async () => {
    const result = await loop({
      history: [
        { role: "user", content: "I want to reschedule my booking" },
        {
          role: "assistant",
          content: "Open times on 2026-10-20 for booking BK-000097:\n1) 2026-10-20 11:00\nChoose the new time number",
        },
        { role: "user", content: "1" },
      ],
    });
    assert.equal(result.routed.includes("reschedule_booking"), true);
    assert.match(result.text, /Your booking BK-000097 has been rescheduled/);
    assert.equal(result.text.includes("تم تغيير"), false);
  });

  it("does not show a reschedule success when the tool fails", async () => {
    const result = await loop({
      history: [
        { role: "user", content: "I want to reschedule my booking" },
        {
          role: "assistant",
          content: "Open times on 2026-10-20 for booking BK-000097:\n1) 2026-10-20 11:00\nChoose the new time number",
        },
        { role: "user", content: "1" },
      ],
      reschedule: { success: false, customerFacingMessage: "تم تغيير ميعاد الحجز بنجاح." },
      modelText: "Your booking has been rescheduled.",
    });
    assert.match(result.text, /I couldn't change that time|I couldn't reschedule that booking/);
    assert.equal(result.text.includes("has been rescheduled"), false);
    assert.equal(result.text.includes("تم تغيير"), false);
  });

  it("lists cancellable bookings in Arabic, English, and German before cancelling", async () => {
    const arabic = await loop({ history: [{ role: "user", content: "الغي الحجز" }] });
    assert.deepEqual(arabic.routed, ["search_bookings"]);
    assert.match(arabic.text, /أنهي موعد تلغي/);

    const english = await loop({ history: [{ role: "user", content: "Please cancel my booking" }] });
    assert.deepEqual(english.routed, ["search_bookings"]);
    assert.match(english.text, /Which booking should I cancel\?/);
    assert.equal(english.text.includes("أنهي موعد"), false);

    const german = await loop({ history: [{ role: "user", content: "Ich möchte meine Buchung stornieren" }] });
    assert.deepEqual(german.routed, ["search_bookings"]);
    assert.match(german.text, /Welche Buchung soll ich stornieren\?/);
  });

  it("confirms cancellation in the customer language after an Arabic tool result", async () => {
    const english = await loop({
      history: [
        { role: "user", content: "Please cancel my booking." },
        { role: "assistant", content: "Which booking should I cancel?\n1) BK-000097\n2) BK-000095" },
        { role: "user", content: "BK-000097" },
      ],
    });
    assert.deepEqual(english.routed, ["cancel_booking"]);
    assert.match(english.text, /Your booking BK-000097 has been cancelled successfully/);
    assert.equal(english.text.includes("تم إلغاء"), false);

    const german = await loop({
      history: [
        { role: "user", content: "Ich möchte meine Buchung stornieren" },
        { role: "assistant", content: "Welche Buchung soll ich stornieren?\n1) BK-000097" },
        { role: "user", content: "BK-000097" },
      ],
    });
    assert.match(german.text, /Deine Buchung BK-000097 wurde erfolgreich storniert/);

    const arabic = await loop({
      history: [
        { role: "user", content: "الغي الحجز" },
        { role: "assistant", content: "قولّي أنهي موعد تلغي؟\n1) BK-000097" },
        { role: "user", content: "BK-000097" },
      ],
    });
    assert.match(arabic.text, /تم إلغاء الحجز BK-000097/);
  });

  it("says when no booking can be cancelled", async () => {
    const result = await loop({
      history: [{ role: "user", content: "Please cancel my booking" }],
      bookings: [],
    });
    assert.match(result.text, /I couldn't find a booking to cancel/);
    assert.equal(result.routed.includes("cancel_booking"), false);
  });

  it("does not show a cancellation success when the tool fails", async () => {
    const result = await loop({
      history: [
        { role: "user", content: "Please cancel my booking." },
        { role: "assistant", content: "Which booking should I cancel?\n1) BK-000097" },
        { role: "user", content: "BK-000097" },
      ],
      cancel: { success: false, customerFacingMessage: "تم إلغاء الحجز بنجاح." },
      modelText: "Your booking has been cancelled successfully.",
    });
    assert.match(result.text, /I couldn't cancel that booking/);
    assert.equal(result.text.includes("cancelled successfully"), false);
    assert.equal(result.text.includes("تم إلغاء"), false);
  });

  it("does not cancel or reschedule without the tool permission", async () => {
    const cancel = await loop({
      history: [
        { role: "assistant", content: "Which booking should I cancel?\n1) BK-000097" },
        { role: "user", content: "Please cancel booking BK-000097" },
      ],
      allowed: ["search_bookings"],
    });
    assert.equal(cancel.routed.includes("cancel_booking"), false);

    const move = await loop({
      history: [{ role: "user", content: "I want to reschedule booking BK-000097 on 2026-10-20 at 11:00" }],
      allowed: ["search_bookings"],
      modelText: "Your booking has been rescheduled.",
    });
    assert.equal(move.routed.includes("reschedule_booking"), false);
    assert.equal(move.text.includes("has been rescheduled"), false);
  });
});
