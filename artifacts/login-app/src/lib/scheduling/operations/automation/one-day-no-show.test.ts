import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAppointmentDatePassedByOneDay,
  selectOneDayNoShowCandidates,
} from "./one-day-no-show.ts";

describe("isAppointmentDatePassedByOneDay", () => {
  it("is false on the appointment calendar day", () => {
    const now = new Date("2026-10-04T20:00:00.000Z");
    assert.equal(
      isAppointmentDatePassedByOneDay("2026-10-04T16:30:00.000Z", "Africa/Cairo", now),
      false,
    );
  });

  it("is true on the next calendar day in the booking timezone", () => {
    const now = new Date("2026-10-05T00:30:00.000Z");
    assert.equal(
      isAppointmentDatePassedByOneDay("2026-10-04T16:30:00.000Z", "Africa/Cairo", now),
      true,
    );
  });

  it("is false for a future appointment", () => {
    const now = new Date("2026-10-04T08:00:00.000Z");
    assert.equal(
      isAppointmentDatePassedByOneDay("2026-10-06T16:00:00.000Z", "Africa/Cairo", now),
      false,
    );
  });
});

describe("selectOneDayNoShowCandidates", () => {
  const now = new Date("2026-10-06T10:00:00.000Z");

  it("keeps only confirmed visits from a previous calendar day", () => {
    const selected = selectOneDayNoShowCandidates(
      [
        {
          id: "past-confirmed",
          status: "confirmed",
          startAt: "2026-10-04T16:30:00.000Z",
          timezone: "Africa/Cairo",
        },
        {
          id: "past-checked-in",
          status: "checked_in",
          startAt: "2026-10-04T16:00:00.000Z",
          timezone: "Africa/Cairo",
        },
        {
          id: "today-confirmed",
          status: "confirmed",
          startAt: "2026-10-06T15:00:00.000Z",
          timezone: "Africa/Cairo",
        },
        {
          id: "past-cancelled",
          status: "cancelled",
          startAt: "2026-08-20T18:00:00.000Z",
          timezone: "Africa/Cairo",
        },
      ],
      now,
    );
    assert.deepEqual(
      selected.map((row) => row.id),
      ["past-confirmed"],
    );
  });
});
