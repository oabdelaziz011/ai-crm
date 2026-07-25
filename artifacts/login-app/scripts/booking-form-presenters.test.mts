import assert from "node:assert/strict";
import {
  BOOKING_SLOT_MESSAGE_KEYS,
  filterEligibleBookingResources,
  resolveBookingSlotMessageKey,
} from "../src/lib/booking/booking-form-presenters.ts";
import type { EligibleResourceRef } from "../src/lib/scheduling/types.ts";
import type { ResolvedSlots } from "../src/lib/scheduling/slot-generation-engine/types.ts";

function resource(overrides: Partial<EligibleResourceRef> = {}): EligibleResourceRef {
  return {
    id: "r1",
    name: "Room A",
    resource_type: "room",
    status: "active",
    timezone: "UTC",
    branch_id: null,
    ...overrides,
  };
}

function slots(overrides: Partial<ResolvedSlots> = {}): ResolvedSlots {
  return {
    available: false,
    date: "2026-07-20",
    timezone: "UTC",
    resourceId: "r1",
    serviceId: "s1",
    durationMinutes: 30,
    periods: [],
    slots: [],
    generatedSlots: [],
    reasons: [],
    meta: {
      slotIntervalMinutes: 15,
      bookingCount: 0,
      slotsBeforeConflictRemoval: 0,
    },
    ...overrides,
  };
}

{
  assert.deepEqual(
    filterEligibleBookingResources([
      resource(),
      resource({ id: "r2", status: "inactive" }),
      resource({ id: "r3", branch_id: "b1" }),
    ]),
    [resource(), resource({ id: "r3", branch_id: "b1" })],
  );
  assert.deepEqual(
    filterEligibleBookingResources(
      [resource(), resource({ id: "r3", branch_id: "b1" })],
      "b1",
    ),
    [resource(), resource({ id: "r3", branch_id: "b1" })],
  );
  assert.deepEqual(
    filterEligibleBookingResources([resource({ id: "r3", branch_id: "b2" })], "b1"),
    [],
  );
}

{
  assert.equal(
    resolveBookingSlotMessageKey(slots({ reasons: ["holiday"] })),
    BOOKING_SLOT_MESSAGE_KEYS.holiday,
  );
  assert.equal(
    resolveBookingSlotMessageKey(slots({ reasons: ["missing_weekly_schedule"] })),
    BOOKING_SLOT_MESSAGE_KEYS.noWorkingHours,
  );
  assert.equal(
    resolveBookingSlotMessageKey(
      slots({
        periods: [{ start: "09:00", end: "12:00" }],
        meta: {
          slotIntervalMinutes: 15,
          bookingCount: 2,
          slotsBeforeConflictRemoval: 3,
        },
      }),
    ),
    BOOKING_SLOT_MESSAGE_KEYS.allSlotsBooked,
  );
  assert.equal(
    resolveBookingSlotMessageKey(slots({ available: true, slots: ["09:00"] })),
    null,
  );
}

console.log("✔ booking form presenters");
