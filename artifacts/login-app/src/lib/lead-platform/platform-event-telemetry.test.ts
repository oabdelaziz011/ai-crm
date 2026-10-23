import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlatformEventTelemetryFailure } from "./platform-event-telemetry.js";

describe("platform event telemetry classification", () => {
  it("treats a row-level denial on platform_event_audit as telemetry", () => {
    assert.equal(
      isPlatformEventTelemetryFailure({
        code: "42501",
        message: 'new row violates row-level security policy for table "platform_event_audit"',
      }),
      true,
    );
  });

  it("keeps a row-level denial on a business table required", () => {
    assert.equal(
      isPlatformEventTelemetryFailure({
        code: "42501",
        message: 'new row violates row-level security policy for table "opportunities"',
      }),
      false,
    );
  });

  it("keeps non-permission failures required", () => {
    assert.equal(isPlatformEventTelemetryFailure(new Error("LeadUpdated subscriber failed")), false);
  });
});
