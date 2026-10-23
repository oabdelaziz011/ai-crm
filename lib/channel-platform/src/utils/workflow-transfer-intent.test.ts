import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBookingTransferIntent } from "./workflow-transfer-intent.js";

describe("isBookingTransferIntent", () => {
  it("detects Arabic booking requests", () => {
    assert.equal(isBookingTransferIntent("عايز أحجز موعد"), true);
    assert.equal(isBookingTransferIntent("مواعيد الدكاترة"), true);
    assert.equal(isBookingTransferIntent("ازيك"), false);
    assert.equal(isBookingTransferIntent("ايه الاسعار"), false);
    assert.equal(isBookingTransferIntent("اسعار العيادات"), false);
    assert.equal(isBookingTransferIntent("عايز احجز واعرف السعر"), true);
  });

  it("detects English booking requests", () => {
    assert.equal(isBookingTransferIntent("I want to book an appointment"), true);
    assert.equal(isBookingTransferIntent("hello"), false);
  });
});
