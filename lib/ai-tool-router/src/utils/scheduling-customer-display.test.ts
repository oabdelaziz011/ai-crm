import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAvailabilityCustomerSummary,
  buildBookingConfirmationMessageAr,
  formatArabicTime12h,
  formatArabicWeekdayDate,
} from "./scheduling-customer-display.js";

describe("scheduling-customer-display", () => {
  it("formats Arabic weekday + Gregorian date", () => {
    const label = formatArabicWeekdayDate("2026-08-23");
    assert.match(label, /23|٢٣/);
    assert.match(label, /2026|٢٠٢٦/);
  });

  it("formats 12-hour Arabic time", () => {
    const evening = formatArabicTime12h("19:00");
    assert.match(evening, /07:00 مساءً/);
    const morning = formatArabicTime12h("10:00");
    assert.match(morning, /10:00|١٠:٠٠/);
  });

  it("builds grouped availability summary", () => {
    const summary = buildAvailabilityCustomerSummary({
      resourceName: "ADAM",
      slotsByDate: new Map([
        ["2026-08-23", ["17:00", "18:00", "19:00"]],
        ["2026-08-24", ["10:00", "11:00"]],
      ]),
    });
    assert.ok(summary?.includes("المواعيد المتاحة"));
    assert.ok(summary?.includes("2026") || summary?.includes("٢٠٢٦") || summary?.includes("23"));
    assert.ok(summary?.includes("•"));
  });

  it("builds booking confirmation from stored values", () => {
    const message = buildBookingConfirmationMessageAr({
      bookingId: "bk-12345678-abcd",
      date: "2026-08-23",
      slotStart: "19:00",
      customerName: "عمر مجدي",
      serviceName: "العيادة",
    });
    assert.match(message, /عمر مجدي/);
    assert.match(message, /العيادة/);
    assert.match(message, /BK123456|12345678/i);
  });
});
