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

  it("builds booking confirmation from stored confirmation number", () => {
    const message = buildBookingConfirmationMessageAr({
      bookingId: "927aa3f5-4812-4dd5-8666-db7610fb6cdf",
      confirmationNumber: "BK-000044",
      date: "2026-08-23",
      slotStart: "19:00",
      customerName: "عمر مجدي",
      serviceName: "العيادة",
    });
    assert.match(message, /عمر مجدي/);
    assert.match(message, /العيادة/);
    assert.match(message, /رقم الحجز: BK-000044/);
    assert.doesNotMatch(message, /927AA3F5/i);
  });

  it("rejects confirmation without authoritative confirmation number", () => {
    assert.throws(() =>
      buildBookingConfirmationMessageAr({
        bookingId: "927aa3f5-4812-4dd5-8666-db7610fb6cdf",
        date: "2026-08-23",
        slotStart: "19:00",
      }),
    );
  });
});
