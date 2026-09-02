import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BookingLifecycleService } from "../booking-domain/booking-lifecycle-service.ts";
import { ACTIVE_BOOKING_STATUSES } from "../booking-domain/types.ts";

describe("business apology cancellable statuses", () => {
  it("only treats active lifecycle statuses as cancellable targets", () => {
    for (const status of ACTIVE_BOOKING_STATUSES) {
      assert.equal(BookingLifecycleService.isActive(status), true);
      assert.equal(BookingLifecycleService.canTransition(status, "cancelled"), true);
    }
  });

  it("does not cancel terminal statuses", () => {
    for (const status of ["completed", "cancelled", "no_show", "rescheduled", "archived"] as const) {
      assert.equal(BookingLifecycleService.isActive(status), false);
      assert.equal(BookingLifecycleService.canTransition(status, "cancelled"), false);
    }
  });
});
