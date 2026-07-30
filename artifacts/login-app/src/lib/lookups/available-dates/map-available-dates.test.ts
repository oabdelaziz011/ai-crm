import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableDateRecordToLookupRow,
  formatAvailableDateLabel,
} from "./map-available-dates";

describe("map-available-dates", () => {
  it("formats a readable date label in the company timezone", () => {
    const label = formatAvailableDateLabel("2026-07-29", "UTC");
    assert.match(label, /2026/);
    assert.match(label, /29/);
  });

  it("maps available date records to lookup rows", () => {
    const row = availableDateRecordToLookupRow(
      {
        date: "2026-07-29",
        display_date: "Wed, Jul 29, 2026",
        service_id: "service-1",
        resource_id: "resource-1",
        timezone: "UTC",
      },
      "display_date",
      "date",
    );

    assert.equal(row.id, "2026-07-29");
    assert.equal(row.title, "Wed, Jul 29, 2026");
    assert.equal(row.value, "2026-07-29");
  });
});
