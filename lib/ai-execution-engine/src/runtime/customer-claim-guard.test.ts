import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileUnverifiedCustomerClaims } from "./customer-claim-guard.js";

describe("customer claim guard", () => {
  it("leaves an ordinary mention of quotes unchanged", () => {
    const result = reconcileUnverifiedCustomerClaims(
      "I can prepare a quote draft if you want one.",
      [],
    );
    assert.equal(result.adjusted, false);
    assert.match(result.text, /quote draft/);
  });

  it("removes a sent-quote claim when delivery state is not sent", () => {
    const result = reconcileUnverifiedCustomerClaims("I've sent the quote to your email.", [
      {
        toolKey: "request_send_quote",
        status: "completed",
        output: { success: true, sent: false, deliveryState: "pending_human_approval" },
      },
    ]);
    assert.equal(result.adjusted, true);
    assert.match(result.text, /could not confirm that a quote was sent/);
    assert.doesNotMatch(result.text, /I've sent the quote/);
  });

  it("keeps a booking confirmation when the demo tool persisted a booking and handoff", () => {
    const text = "Your demo is confirmed. A human representative will continue with you.";
    const result = reconcileUnverifiedCustomerClaims(text, [
      {
        toolKey: "create_demo_booking",
        status: "completed",
        output: { success: true, bookingId: "booking-1", handoffSucceeded: true },
      },
    ]);
    assert.equal(result.adjusted, false);
    assert.equal(result.text, text);
  });

  it("rejects a payment claim and a purchase claim when neither is persisted", () => {
    const result = reconcileUnverifiedCustomerClaims(
      "Your payment was received. The purchase is complete.",
      [],
    );
    assert.equal(result.adjusted, true);
    assert.match(result.text, /could not confirm that a payment was received/);
    assert.match(result.text, /could not confirm that a purchase was completed/);
  });

  it("keeps a negated sentence that mentions a quote was not sent", () => {
    const text = "لم يتم إرسال عرض السعر.";
    const result = reconcileUnverifiedCustomerClaims(text, []);
    assert.equal(result.adjusted, false);
    assert.equal(result.text, text);
  });

  it("hides internal not_listed wording and keeps an ordinary missing-feature sentence", () => {
    const leaked = reconcileUnverifiedCustomerClaims("Price: Not listed. The status was not_listed.", []);
    assert.equal(leaked.adjusted, true);
    assert.match(leaked.text, /price is not confirmed/i);
    assert.doesNotMatch(leaked.text, /not_listed|Not listed/i);
    const kept = reconcileUnverifiedCustomerClaims("Noise cancelling is not listed for Aurora Buds.", []);
    assert.equal(kept.text, "Noise cancelling is not listed for Aurora Buds.");
  });
});
