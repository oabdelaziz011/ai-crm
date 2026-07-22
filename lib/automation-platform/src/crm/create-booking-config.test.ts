import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { staticBinding, variableBinding } from "../field-binding/normalize.js";
import { normalizeCreateBookingConfig } from "./create-booking-config.js";

describe("create booking config", () => {
  it("migrates legacy create booking config", () => {
    const migrated = normalizeCreateBookingConfig({
      serviceName: "Consultation",
      dateField: "booking_date",
    });

    assert.deepEqual(migrated.service, staticBinding("Consultation"));
    assert.deepEqual(migrated.appointmentDate, variableBinding("booking_date"));
    assert.deepEqual(migrated.appointmentTime, staticBinding("00:00"));
    assert.deepEqual(migrated.customer, variableBinding("customer.id"));
  });
});
