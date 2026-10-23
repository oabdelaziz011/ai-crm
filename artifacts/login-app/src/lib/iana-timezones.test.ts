import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listIanaTimeZones, timezoneSelectOptions } from "./iana-timezones.js";

describe("iana timezones", () => {
  it("returns a non-empty sorted list including UTC", () => {
    const zones = listIanaTimeZones();
    assert.ok(zones.length > 10);
    assert.ok(zones.includes("UTC"));
    assert.deepEqual([...zones].sort((a, b) => a.localeCompare(b)), zones);
    // Prefer a regional zone when the runtime provides the full IANA set.
    if (zones.length > 50) {
      assert.ok(zones.some((zone) => zone.startsWith("Africa/") || zone.startsWith("Asia/")));
    }
  });

  it("keeps an unknown current value in the select options", () => {
    const options = timezoneSelectOptions("Custom/Zone");
    assert.equal(options[0], "Custom/Zone");
    assert.ok(options.includes("UTC"));
  });

  it("treats empty current as optional (no extra row)", () => {
    const options = timezoneSelectOptions("");
    assert.equal(options.includes(""), false);
    assert.ok(options.includes("UTC"));
  });
});
