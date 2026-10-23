import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCustomerLanguage, resolveConversationLanguage } from "./customer-language.js";
import { trySalesConversationTurn, salesCalendarYmd } from "./sales-conversation-turn.js";

const PUBLIC_TOOLS = [
  "knowledge_search",
  "search_availability",
  "find_next_available",
  "recommend_appointment",
  "escalate_to_human",
  "queue_handoff",
];

describe("customer language", () => {
  it("detects Arabic, English, and German, and keeps a product name from switching", () => {
    assert.equal(detectCustomerLanguage("السلام عليكم، عايز أعرف سعر المنتج"), "ar");
    assert.equal(detectCustomerLanguage("ما مواصفات المنتج ده؟"), "ar");
    assert.equal(detectCustomerLanguage("Hello, what is the price of Aurora Studio?"), "en");
    assert.equal(detectCustomerLanguage("I would like information about your services."), "en");
    assert.equal(detectCustomerLanguage("Guten Tag, was kostet Aurora Studio?"), "de");
    assert.equal(detectCustomerLanguage("Ich möchte morgen um 10:00 eine Demo buchen."), "de");
    assert.equal(detectCustomerLanguage("Aurora Studio"), null);
    assert.equal(detectCustomerLanguage("thanks"), null);

    assert.equal(
      resolveConversationLanguage({
        userTexts: ["Was kostet Aurora Studio?", "Aurora Studio", "danke"],
      }),
      "de",
    );
    assert.equal(
      resolveConversationLanguage({
        userTexts: ["What is the price of Aurora Studio?", "تمام، عايز أشتري Aurora Studio"],
      }),
      "ar",
    );
  });
});

describe("sales tools stay language-independent", () => {
  it("books, drafts, and refuses public-chat tools in three languages", async () => {
    const tomorrow = salesCalendarYmd(1);
    const calls: string[] = [];
    const route = async (toolKey: string, toolInput: Record<string, unknown>) => {
      calls.push(toolKey);
      if (toolKey === "list_demo_types") {
        return { status: "ok", output: { demos: [{ serviceId: "svc-1", name: "Product demo" }] } };
      }
      if (toolKey === "create_demo_booking") {
        assert.equal(toolInput.date, tomorrow);
        assert.equal(toolInput.slotStart, "10:00");
        return {
          status: "ok",
          output: { success: true, bookingPersisted: true, confirmationNumber: "DEMO-100", handoffSucceeded: true },
        };
      }
      if (toolKey === "search_products") {
        assert.equal(toolInput.query, "Aurora Studio");
        return { status: "ok", output: { products: [{ productId: "prod-1", name: "Aurora Studio", sku: "AUR-1" }] } };
      }
      if (toolKey === "create_draft_quote") {
        return { status: "ok", output: { success: true, quoteId: "quote-1", quoteNumber: "Q-100" } };
      }
      if (toolKey === "request_send_quote") {
        return { status: "ok", output: { success: true, sent: false } };
      }
      return { status: "failed", output: null };
    };

    const demoAr = await trySalesConversationTurn({
      text: "احجز ديمو بكرة الساعة 10:00",
      allowedToolKeys: ["list_demo_types", "create_demo_booking", "escalate_to_human"],
      route,
    });
    const demoEn = await trySalesConversationTurn({
      text: "Book a product demo tomorrow at 10:00",
      allowedToolKeys: ["list_demo_types", "create_demo_booking", "escalate_to_human"],
      route,
    });
    const demoDe = await trySalesConversationTurn({
      text: "Ich möchte morgen um 10:00 eine Demo buchen",
      allowedToolKeys: ["list_demo_types", "create_demo_booking", "escalate_to_human"],
      route,
    });
    assert.match(demoAr ?? "", /تم حجز العرض/);
    assert.match(demoAr ?? "", /DEMO-100/);
    const today = salesCalendarYmd(0);
    let todayBookings = 0;
    const todayReply = await trySalesConversationTurn({
      text: "Please book a product demo today at 15:00",
      allowedToolKeys: ["list_demo_types", "create_demo_booking"],
      route: async (toolKey, toolInput) => {
        if (toolKey === "list_demo_types") {
          return { status: "ok", output: { demos: [{ serviceId: "979845ef-bcae-43a0-a81c-6e9cd657d7bd", name: "ValueOR" }] } };
        }
        if (toolKey === "create_demo_booking") {
          todayBookings += 1;
          assert.equal(toolInput.date, today);
          assert.equal(toolInput.slotStart, "15:00");
          assert.notEqual(toolInput.serviceId, "a1035bb1");
          return { status: "failed", output: { success: false, bookingPersisted: false } };
        }
        return { status: "failed", output: null };
      },
    });
    assert.equal(todayBookings, 1);
    assert.match(todayReply ?? "", /The demo was not booked/);

    assert.match(demoEn ?? "", /The demo is booked/);
    assert.match(demoDe ?? "", /Die Demo ist gebucht/);
    assert.equal(calls.filter((key) => key === "create_demo_booking").length, 3);

    calls.length = 0;
    const quoteDe = await trySalesConversationTurn({
      text: "Bitte ein Angebot für Aurora Studio",
      allowedToolKeys: ["search_products", "create_draft_quote", "request_send_quote"],
      route,
    });
    assert.match(quoteDe ?? "", /Angebotsentwurf/);
    assert.match(quoteDe ?? "", /nicht gesendet/);
    assert.match(quoteDe ?? "", /Q-100/);
    assert.deepEqual(calls, ["search_products", "create_draft_quote", "request_send_quote"]);

    const failed = await trySalesConversationTurn({
      text: "Please send a quote for Aurora Studio",
      allowedToolKeys: ["search_products", "create_draft_quote", "request_send_quote"],
      route: async () => ({ status: "failed", output: null }),
    });
    assert.match(failed ?? "", /could not load that information/i);
    assert.doesNotMatch(failed ?? "", /not_listed|tool/i);

    let publicCalls = 0;
    const blocked = await trySalesConversationTurn({
      text: "Ich möchte morgen um 10:00 eine Demo buchen und ein Angebot für Aurora Studio",
      allowedToolKeys: PUBLIC_TOOLS,
      route: async () => {
        publicCalls += 1;
        return { status: "ok", output: { success: true } };
      },
    });
    assert.equal(blocked, null);
    assert.equal(publicCalls, 0);
  });
});
