import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerDeleteWarningAr,
  type CustomerDeleteDependencySummary,
} from "./customer-delete-warning.js";

describe("buildCustomerDeleteWarningAr", () => {
  it("returns null when there are no dependencies", () => {
    assert.equal(
      buildCustomerDeleteWarningAr({ bookingCount: 0, futureBookingCount: 0, openTicketCount: 0 }),
      null,
    );
  });

  it("warns about bookings in Arabic", () => {
    const text = buildCustomerDeleteWarningAr({
      bookingCount: 1,
      futureBookingCount: 1,
      openTicketCount: 0,
    });
    assert.match(String(text), /هذا العميل مرتبط بموعد أو أكثر/);
  });

  it("warns about open tickets", () => {
    const deps: CustomerDeleteDependencySummary = {
      bookingCount: 0,
      futureBookingCount: 0,
      openTicketCount: 2,
    };
    const text = buildCustomerDeleteWarningAr(deps);
    assert.match(String(text), /تذكرة مفتوحة/);
  });
});
