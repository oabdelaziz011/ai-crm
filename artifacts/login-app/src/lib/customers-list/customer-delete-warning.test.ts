import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCustomerDeleteWarningAr,
  isCustomerDeleteBlockedByBookings,
  type CustomerDeleteDependencySummary,
} from "./customer-delete-warning.js";

const emptyDeps = (): CustomerDeleteDependencySummary => ({
  bookingCount: 0,
  futureBookingCount: 0,
  openTicketCount: 0,
  blockingBookingCount: 0,
});

describe("buildCustomerDeleteWarningAr", () => {
  it("returns null when there are no dependencies", () => {
    assert.equal(buildCustomerDeleteWarningAr(emptyDeps()), null);
  });

  it("warns about bookings in Arabic", () => {
    const text = buildCustomerDeleteWarningAr({
      ...emptyDeps(),
      bookingCount: 1,
      futureBookingCount: 1,
      blockingBookingCount: 1,
    });
    assert.match(String(text), /هذا العميل مرتبط بموعد أو أكثر/);
  });

  it("warns about open tickets", () => {
    const deps: CustomerDeleteDependencySummary = {
      ...emptyDeps(),
      openTicketCount: 2,
    };
    const text = buildCustomerDeleteWarningAr(deps);
    assert.match(String(text), /تذكرة مفتوحة/);
  });

  it("blocks hard-delete when any booking row exists", () => {
    assert.equal(isCustomerDeleteBlockedByBookings(emptyDeps()), false);
    assert.equal(
      isCustomerDeleteBlockedByBookings({ ...emptyDeps(), blockingBookingCount: 1 }),
      true,
    );
    assert.equal(
      isCustomerDeleteBlockedByBookings({ ...emptyDeps(), bookingCount: 1 }),
      true,
    );
  });
});
