import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableDateRecordToLookupRow,
  formatAvailableDateLabel,
} from "./map-available-dates";

describe("map-available-dates", () => {
  it("formats a readable date label in the company timezone", () => {
    const label = formatAvailableDateLabel("2026-07-29", "UTC", "en-US");
    assert.match(label, /29/);
    assert.match(label, /Jul|July/i);
  });

  it("formats weekday and month in Arabic when locale is Arabic", () => {
    const label = formatAvailableDateLabel("2026-08-10", "Africa/Cairo", "ar-EG");
    assert.match(label, /10/);
    assert.match(label, /أغس|أوت|آب|الاثنين|الإثنين/);
    assert.ok(!label.includes("2026-08-10"));
  });

  it("maps available date records to lookup rows without duplicate description", () => {
    const row = availableDateRecordToLookupRow(
      {
        date: "2026-07-29",
        display_date: "Wed, Jul 29",
        service_id: "service-1",
        resource_id: "resource-1",
        timezone: "UTC",
      },
      "display_date",
      "date",
    );

    assert.equal(row.id, "2026-07-29");
    assert.equal(row.title, "Wed, Jul 29");
    assert.equal(row.value, "2026-07-29");
    assert.equal(row.description, undefined);
  });
});
