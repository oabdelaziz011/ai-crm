import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSchedulingOperationIntent,
  schedulingIntentAllowsTool,
} from "./scheduling-operation-intent.js";

function intentFor(text: string) {
  return resolveSchedulingOperationIntent([{ role: "user", content: text }]);
}

describe("product questions are not booking requests", () => {
  const productQuestions = [
    "What wireless headphones do you have?",
    "كم سعر السماعات؟",
    "Do you sell the Sonic brand?",
    "Compare these two products",
    "ابحث عن منتج WH-100",
    "Is this item in the catalog?",
  ];

  for (const text of productQuestions) {
    it(`does not treat "${text}" as a booking`, () => {
      const intent = intentFor(text);
      assert.equal(intent, "none");
      assert.equal(schedulingIntentAllowsTool(intent, "search_products"), true);
      assert.equal(schedulingIntentAllowsTool(intent, "get_product_details"), true);
    });
  }

  it("does not allow product lookup tools during an actual booking request", () => {
    const intent = intentFor("احجز لي موعد");
    assert.equal(intent, "booking");
    assert.equal(schedulingIntentAllowsTool(intent, "search_products"), false);
    assert.equal(schedulingIntentAllowsTool(intent, "get_product_details"), false);
    assert.equal(schedulingIntentAllowsTool(intent, "create_booking"), true);
  });

  it("does not allow product lookup tools during cancel or reschedule", () => {
    assert.equal(schedulingIntentAllowsTool(intentFor("الغي الحجز"), "search_products"), false);
    assert.equal(schedulingIntentAllowsTool(intentFor("أغير الميعاد"), "get_product_details"), false);
  });

  it("keeps a general non-product question off the booking path", () => {
    const intent = intentFor("what time do you open?");
    assert.equal(intent, "none");
    assert.equal(schedulingIntentAllowsTool(intent, "create_booking"), true);
  });

  it("classifies a combined product question and booking request as booking", () => {
    const intent = intentFor("What products do you have, and can I book an appointment?");
    assert.equal(intent, "booking");
    assert.equal(schedulingIntentAllowsTool(intent, "search_products"), false);
    assert.equal(schedulingIntentAllowsTool(intent, "create_booking"), true);
  });

  it("keeps a product question that only mentions a complaint on product tools", () => {
    // Policy: a ticket intent requires an explicit open/file/status/comment request.
    // "I have a complaint" is a mention, not a request to open a ticket.
    const intent = intentFor("Tell me about Product A, then I have a complaint");
    assert.equal(intent, "none");
    assert.equal(schedulingIntentAllowsTool(intent, "search_products"), true);
    assert.equal(schedulingIntentAllowsTool(intent, "create_ticket"), true);
  });

  it("classifies an explicit request to file a complaint as a ticket", () => {
    const intent = intentFor("Tell me about Product A, then I want to file a complaint");
    assert.equal(intent, "ticket");
    assert.equal(schedulingIntentAllowsTool(intent, "search_products"), false);
    assert.equal(schedulingIntentAllowsTool(intent, "create_ticket"), true);
  });

  it("allows product tools for a bare product name and Egyptian colloquial wording", () => {
    for (const text of ["Wireless Headphones", "عندكوا السماعات؟", "عايز اعرف سعر السماعات"]) {
      const intent = intentFor(text);
      assert.equal(intent, "none", text);
      assert.equal(schedulingIntentAllowsTool(intent, "search_products"), true, text);
    }
  });
});
