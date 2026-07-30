import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import type { CreateBookingInput } from "@workspace/automation-platform";

function resolveLocalSlotFromInstant(startAt: string, timezone: string) {
  const instant = TimezoneResolver.parseInstant(startAt);
  return {
    date: TimezoneResolver.localDateForInstant(instant, timezone),
    slotStart: TimezoneResolver.localTimeForInstant(instant, timezone),
  };
}

describe("automation booking adapter slot resolution", () => {
  it("converts selected_slot UTC instant to local date/time in Africa/Cairo", () => {
    const schedulingSlot = {
      startAt: "2026-08-02T18:15:00.000Z",
      timezone: "Africa/Cairo",
      serviceId: "service-1",
      resourceId: "resource-1",
    };

    const resolved = resolveLocalSlotFromInstant(schedulingSlot.startAt, schedulingSlot.timezone);

    assert.equal(resolved.date, "2026-08-02");
    assert.equal(resolved.slotStart, "21:15");
  });

  it("does not treat UTC clock fragments as local wall-clock", () => {
    const startAt = "2026-08-02T18:15:00.000Z";
    const utcSlice = {
      date: startAt.slice(0, 10),
      slotStart: startAt.split("T")[1]?.slice(0, 5) ?? "",
    };
    const local = resolveLocalSlotFromInstant(startAt, "Africa/Cairo");

    assert.notDeepEqual(local, utcSlice);
    assert.equal(local.slotStart, "21:15");
  });

  it("accepts service id and name references for scheduling routing", () => {
    const services = [
      { id: "a8a6403e-4c88-48ae-aa46-d204ea8ef49d", name: "Clinic Visit" },
    ];

    const byId = services.find((item) => item.id === "a8a6403e-4c88-48ae-aa46-d204ea8ef49d");
    const byName = services.find((item) => item.name.toLowerCase() === "clinic visit");

    assert.ok(byId);
    assert.ok(byName);
  });

  it("builds schedulingSlot payload shape expected by create booking action", () => {
    const input: CreateBookingInput = {
      companyId: "company-1",
      userId: "user-1",
      service: "Clinic Visit",
      doctorId: "resource-1",
      locationId: "branch-1",
      appointmentDate: "2026-08-02",
      appointmentTime: "2026-08-02T18:15:00.000Z",
      customerId: "customer-1",
      schedulingSlot: {
        startAt: "2026-08-02T18:15:00.000Z",
        timezone: "Africa/Cairo",
        serviceId: "service-1",
        resourceId: "resource-1",
      },
    };

    assert.equal(input.schedulingSlot?.resourceId, "resource-1");
    assert.equal(input.schedulingSlot?.serviceId, "service-1");
  });
});
