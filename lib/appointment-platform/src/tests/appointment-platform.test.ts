import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSchedulingBookingToAppointment } from "../types/appointment-types.js";

describe("appointment type mapping", () => {
  it("maps scheduling booking rows to appointment records", () => {
    const appointment = mapSchedulingBookingToAppointment({
      id: "appt-1",
      company_id: "company-1",
      branch_id: null,
      customer_id: "cust-1",
      lead_id: "lead-1",
      conversation_id: "conv-1",
      resource_id: "res-1",
      service_id: "svc-1",
      start_at: "2026-08-02T10:00:00.000Z",
      end_at: "2026-08-02T11:00:00.000Z",
      timezone: "UTC",
      status: "confirmed",
      source: "crm",
      notes: null,
      rescheduled_from_id: null,
      version: 1,
      created_by: null,
      updated_by: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      deleted_at: null,
    });

    assert.equal(appointment.id, "appt-1");
    assert.equal(appointment.leadId, "lead-1");
    assert.equal(appointment.conversationId, "conv-1");
  });
});
