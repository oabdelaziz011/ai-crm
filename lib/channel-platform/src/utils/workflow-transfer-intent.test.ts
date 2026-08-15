import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBookingTransferIntent } from "./workflow-transfer-intent.js";

describe("isBookingTransferIntent", () => {
  it("detects Arabic booking requests", () => {
    assert.equal(isBookingTransferIntent("عايز أحجز موعد"), true);
    assert.equal(isBookingTransferIntent("مواعيد الدكاترة"), true);
    assert.equal(isBookingTransferIntent("ازيك"), false);
  });

  it("detects English booking requests", () => {
    assert.equal(isBookingTransferIntent("I want to book an appointment"), true);
    assert.equal(isBookingTransferIntent("hello"), false);
  });
});
