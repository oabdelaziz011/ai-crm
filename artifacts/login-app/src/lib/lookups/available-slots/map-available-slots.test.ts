import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableSlotRecordToLookupRow,
  mapResolvedSlotsToAvailableSlotRecords,
} from "./map-available-slots";

describe("mapResolvedSlotsToAvailableSlotRecords", () => {
  it("maps generated slots to structured records using slot interval output", () => {
    const resolved = {
      available: true,
      date: "2026-07-28",
      timezone: "UTC",
      resourceId: "res_1",
      serviceId: "svc_1",
      durationMinutes: 30,
      periods: [{ start: "09:00", end: "11:00" }],
      slots: ["09:00", "09:15", "09:30", "09:45", "10:00"],
      generatedSlots: [
        { start: "09:00", end: "09:30" },
        { start: "09:15", end: "09:45" },
        { start: "09:30", end: "10:00" },
        { start: "09:45", end: "10:15" },
        { start: "10:00", end: "10:30" },
      ],
      reasons: [],
      meta: {
        slotIntervalMinutes: 15,
        bookingCount: 0,
        slotsBeforeConflictRemoval: 5,
      },
    };

    const records = mapResolvedSlotsToAvailableSlotRecords(resolved, "branch_1");
    assert.equal(records.length, 5);
    assert.equal(records[0]?.display_time, "9:00 AM");
    assert.equal(records[0]?.duration_minutes, 30);
    assert.equal(records[0]?.service_id, "svc_1");
    assert.equal(records[0]?.resource_id, "res_1");
    assert.equal(records[0]?.branch_id, "branch_1");
    assert.equal(records[0]?.timezone, "UTC");
    assert.match(records[0]?.start_at ?? "", /2026-07-28T09:00:00/);
  });

  it("maps records to lookup rows for list nodes", () => {
    const row = availableSlotRecordToLookupRow(
      {
        start_at: "2026-07-28T09:00:00.000Z",
        end_at: "2026-07-28T09:30:00.000Z",
        display_time: "9:00 AM",
        duration_minutes: 30,
        service_id: "svc_1",
        resource_id: "res_1",
        branch_id: null,
        timezone: "UTC",
      },
      "display_time",
      "start_at",
    );

    assert.equal(row.title, "9:00 AM");
    assert.equal(row.id, "2026-07-28T09:00:00.000Z");
    assert.equal(row.record?.duration_minutes, 30);
  });
});
