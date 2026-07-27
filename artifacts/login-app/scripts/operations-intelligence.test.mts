import assert from "node:assert/strict";
import { NoShowEngine } from "../src/lib/scheduling/operations/automation/no-show-engine.ts";
import type { NoShowRuleConfig } from "../src/lib/scheduling/operations/automation/no-show-types.ts";
import {
  buildWaitingQueue,
  formatWaitingDuration,
} from "../src/lib/scheduling/operations/queue/waiting-queue-selector.ts";
import { BookingConflictEngine } from "../src/lib/scheduling/operations/conflicts/booking-conflict-engine.ts";
import {
  computeAdvancedKpis,
  computeCapacityMetrics,
  computeResourceUtilization,
} from "../src/lib/scheduling/operations/analytics/operations-analytics-selectors.ts";
import {
  computeVirtualWindow,
  stickyTimeLabelForSlot,
} from "../src/lib/scheduling/operations/virtualization/virtual-window.ts";
import type { OperationsBookingView } from "../src/lib/scheduling/operations/types/operations-types.ts";

function booking(overrides: Partial<OperationsBookingView> = {}): OperationsBookingView {
  return {
    id: "b1",
    companyId: "c1",
    branchId: "branch-a",
    customerId: "cust-1",
    resourceId: "res-1",
    serviceId: "svc-1",
    startAt: "2026-07-26T09:00:00.000Z",
    endAt: "2026-07-26T09:30:00.000Z",
    timezone: "UTC",
    status: "confirmed",
    notes: null,
    createdBy: null,
    createdAt: "2026-07-26T08:00:00.000Z",
    updatedAt: "2026-07-26T08:00:00.000Z",
    customer: { id: "cust-1", name: "Alice", phone: null, email: null },
    service: { id: "svc-1", name: "Consultation", durationMinutes: 30, priceCents: 0 },
    resource: { id: "res-1", name: "Dr. Smith", type: "doctor" },
    branch: { id: "branch-a", name: "Main" },
    paymentStatus: "unknown",
    displayStart: "09:00",
    displayEnd: "09:30",
    durationMinutes: 30,
    ...overrides,
  };
}

function rule(overrides: Partial<NoShowRuleConfig> = {}): NoShowRuleConfig {
  return {
    id: "r1",
    companyId: "c1",
    branchId: null,
    enabled: true,
    gracePeriodMinutes: 15,
    ...overrides,
  };
}

{
  const now = new Date("2026-07-26T09:20:00.000Z");
  const bookings = [
    booking({ id: "eligible", startAt: "2026-07-26T09:00:00.000Z", status: "confirmed" }),
    booking({ id: "too-soon", startAt: "2026-07-26T09:10:00.000Z", status: "confirmed" }),
    booking({ id: "checked-in", startAt: "2026-07-26T09:00:00.000Z", status: "checked_in" }),
    booking({ id: "disabled-branch", branchId: "branch-b", startAt: "2026-07-26T09:00:00.000Z" }),
  ];
  const rulesMap = NoShowEngine.buildRulesMap([
    rule({ branchId: null, gracePeriodMinutes: 15 }),
    rule({ id: "r2", branchId: "branch-b", enabled: false, gracePeriodMinutes: 5 }),
  ]);

  const results = NoShowEngine.evaluate(bookings, rulesMap, rule(), now);
  assert.deepEqual(
    results.map((r) => r.bookingId),
    ["eligible"],
    "only confirmed bookings past grace period are flagged",
  );
  assert.equal(results[0]?.minutesPastStart, 20);
}

{
  const now = new Date("2026-07-26T10:00:00.000Z");
  const queue = buildWaitingQueue(
    [
      booking({
        id: "q1",
        status: "checked_in",
        updatedAt: "2026-07-26T09:30:00.000Z",
        customer: { id: "c1", name: "Alice", phone: null, email: null },
      }),
      booking({
        id: "q2",
        status: "checked_in",
        updatedAt: "2026-07-26T09:45:00.000Z",
        customer: { id: "c2", name: "Bob", phone: null, email: null },
      }),
      booking({ id: "q3", status: "completed" }),
    ],
    now,
  );

  assert.equal(queue.length, 2);
  assert.equal(queue[0]?.bookingId, "q1", "longest waiting customer is first");
  assert.equal(queue[0]?.waitingMinutes, 30);
  assert.equal(formatWaitingDuration(45), "45m");
  assert.equal(formatWaitingDuration(90), "1h 30m");
}

{
  const existing = booking({
    id: "existing",
    resourceId: "res-1",
    startAt: "2026-07-26T10:00:00.000Z",
    endAt: "2026-07-26T10:30:00.000Z",
    status: "confirmed",
  });

  const overlap = BookingConflictEngine.detectLocalOverlap([existing], {
    bookingId: "moving",
    resourceId: "res-1",
    resourceType: "doctor",
    serviceId: "svc-1",
    startAt: "2026-07-26T10:15:00.000Z",
    endAt: "2026-07-26T10:45:00.000Z",
  });
  assert.equal(overlap.valid, false);
  assert.ok(overlap.conflicts.some((c) => c.category === "doctor"));
  assert.ok(overlap.conflicts.some((c) => c.category === "time_overlap"));

  const clear = BookingConflictEngine.detectLocalOverlap([existing], {
    bookingId: "moving",
    resourceId: "res-2",
    resourceType: "doctor",
    serviceId: "svc-2",
    startAt: "2026-07-26T11:00:00.000Z",
    endAt: "2026-07-26T11:30:00.000Z",
  });
  assert.equal(clear.valid, true);

  const mapped = BookingConflictEngine.fromValidationErrors(["booking_conflict"], "room");
  assert.equal(mapped.valid, false);
  assert.equal(mapped.conflicts[0]?.category, "time_overlap");
}

{
  const bookings = [
    booking({ id: "u1", status: "completed", resourceId: "res-1" }),
    booking({ id: "u2", status: "checked_in", resourceId: "res-1" }),
    booking({ id: "u3", status: "confirmed", resourceId: "res-2" }),
  ];
  const utilization = computeResourceUtilization(bookings);
  assert.equal(utilization.length, 2);
  assert.ok(utilization[0]!.busyPercent >= utilization[1]!.busyPercent);

  const kpis = {
    bookings: 3,
    availableSlots: 2,
    cancelled: 0,
    completed: 1,
    checkedIn: 1,
    occupancyPercent: 60,
    expectedRevenueCents: 0,
    actualRevenueCents: 0,
  };
  const timelineSlots = [
    { id: "s1", kind: "booked" as const },
    { id: "s2", kind: "available" as const },
    { id: "s3", kind: "booked" as const },
  ].map((slot, index) => ({
    ...slot,
    date: "2026-07-26",
    startTime: "09:00",
    endTime: "09:30",
    startMinutes: index * 30,
    endMinutes: (index + 1) * 30,
    booking: null,
    resourceId: null,
    resourceName: null,
  }));

  const capacity = computeCapacityMetrics(kpis, timelineSlots);
  assert.equal(capacity.occupancyPercent, 60);
  assert.equal(capacity.bookedSlots, 2);

  const advanced = computeAdvancedKpis(
    [
      booking({ id: "a1", displayStart: "09:00", status: "confirmed" }),
      booking({ id: "a2", displayStart: "09:00", status: "cancelled" }),
      booking({ id: "a3", displayStart: "10:00", status: "no_show" }),
    ],
    timelineSlots,
    utilization,
  );
  assert.equal(advanced.peakHour, "09:00");
  assert.equal(advanced.peakHourBookings, 2);
  assert.equal(advanced.cancellationRate, 33);
  assert.equal(advanced.noShowRate, 33);
}

{
  const window = computeVirtualWindow(200, 720, 520);
  assert.ok(window.startIndex >= 0);
  assert.ok(window.endIndex > window.startIndex);
  assert.equal(window.totalHeight, 200 * 72);

  assert.equal(stickyTimeLabelForSlot("09:30", "09:00"), false);
  assert.equal(stickyTimeLabelForSlot("10:00", "09:30"), true);
}

console.log("operations-intelligence.test.mts: all assertions passed");
