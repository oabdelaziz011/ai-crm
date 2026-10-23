import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateSlotCandidates,
  isSlotBookableNow,
  sortBookableNearestFirst,
} from "./slot-generation.js";

describe("generateSlotCandidates", () => {
  it("generates future slots from weekly windows for assigned presenters only", () => {
    const from = new Date("2030-01-07T00:00:00.000Z"); // Monday
    const slots = generateSlotCandidates({
      windows: [
        {
          weekday: 1,
          startTime: "09:00:00",
          endTime: "11:00:00",
          timezone: "UTC",
          presenterUserId: null,
          isActive: true,
        },
      ],
      presenterUserIds: ["u1", "u2"],
      durationMinutes: 60,
      bufferMinutes: 0,
      fromDate: from,
      daysAhead: 1,
      timezone: "UTC",
    });
    assert.equal(slots.length, 4); // 09:00 and 10:00 × 2 presenters
    assert.ok(slots.every((s) => s.startAt > new Date("2020-01-01")));
    assert.deepEqual(
      [...new Set(slots.map((s) => s.presenterUserId))].sort(),
      ["u1", "u2"],
    );
  });

  it("generates only the civil dates that were requested", () => {
    const slots = generateSlotCandidates({
      windows: [
        {
          weekday: 1,
          startTime: "09:00:00",
          endTime: "10:00:00",
          timezone: "UTC",
          presenterUserId: "u1",
          isActive: true,
        },
      ],
      presenterUserIds: ["u1"],
      durationMinutes: 60,
      bufferMinutes: 0,
      fromDate: new Date("2030-01-01T00:00:00.000Z"),
      daysAhead: 40,
      dates: ["2030-01-07"],
      timezone: "UTC",
    });
    assert.equal(slots.length, 1);
    assert.equal(slots[0]?.startAt.toISOString().slice(0, 10), "2030-01-07");
  });

  it("does not invent slots without presenters or windows", () => {
    assert.deepEqual(
      generateSlotCandidates({
        windows: [],
        presenterUserIds: ["u1"],
        durationMinutes: 30,
        bufferMinutes: 0,
        fromDate: new Date("2030-01-01T00:00:00.000Z"),
        daysAhead: 7,
        timezone: "UTC",
      }),
      [],
    );
  });
});

describe("isSlotBookableNow / sortBookableNearestFirst", () => {
  it("excludes unpublished, full, and past slots", () => {
    assert.equal(
      isSlotBookableNow({
        status: "draft",
        startAt: "2030-01-01T10:00:00.000Z",
        bookedCount: 0,
        capacity: 1,
      }),
      false,
    );
    assert.equal(
      isSlotBookableNow({
        status: "published",
        startAt: "2030-01-01T10:00:00.000Z",
        bookedCount: 1,
        capacity: 1,
      }),
      false,
    );
    assert.equal(
      isSlotBookableNow({
        status: "published",
        startAt: "2020-01-01T10:00:00.000Z",
        bookedCount: 0,
        capacity: 1,
      }),
      false,
    );
    assert.equal(
      isSlotBookableNow({
        status: "published",
        startAt: "2030-01-01T10:00:00.000Z",
        bookedCount: 0,
        capacity: 1,
      }),
      true,
    );
  });

  it("orders nearest first", () => {
    const sorted = sortBookableNearestFirst([
      { startAt: "2030-01-02T10:00:00.000Z", id: "b" },
      { startAt: "2030-01-01T10:00:00.000Z", id: "a" },
    ]);
    assert.deepEqual(
      sorted.map((s) => s.id),
      ["a", "b"],
    );
  });
});
