import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultBookingServicePort } from "../../ports/booking-service-port.js";
import { InMemoryBookingRepository } from "../../crm/booking-repository-port.js";
import { executeCreateBookingAction } from "./create-booking-action.js";
import type { ExecutionContext } from "../execution-context.js";
import { staticBinding, variableBinding } from "../../field-binding/normalize.js";

function createContext(config: Record<string, unknown>, variables: Record<string, unknown> = {}): ExecutionContext {
  return {
    company: { id: "company-1" },
    flow: {
      id: "flow-1",
      company_id: "company-1",
      name: "Flow",
      description: "",
      trigger_type: "inbound_message",
      status: "active",
      version: 1,
      metadata: {},
      active_version_id: null,
      has_unpublished_draft: false,
      created_by: null,
      updated_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by: null,
    },
    run: {
      id: "run-1",
      company_id: "company-1",
      flow_id: "flow-1",
      session_id: "session-1",
      status: "running",
      trigger_source: "manual",
      current_node_id: "node-1",
      variables,
      metadata: { actorUserId: "user-1" },
      error_message: null,
      started_at: new Date().toISOString(),
      finished_at: null,
    },
    session: {
      id: "session-1",
      company_id: "company-1",
      channel: "whatsapp",
      external_user_id: "ext-1",
      customer_id: "cust-1",
      flow_id: "flow-1",
      run_id: "run-1",
      current_node_id: "node-1",
      status: "running",
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
      metadata: {},
      variables,
    },
    variables,
    customer: { id: "cust-1" },
    currentNode: {
      id: "node-1",
      flow_id: "flow-1",
      type: "action",
      config,
      position_x: 0,
      position_y: 0,
      created_at: new Date().toISOString(),
    },
    nodes: [],
    edges: [],
  };
}

describe("executeCreateBookingAction", () => {
  it("creates a booking from bound fields and legacy config", async () => {
    const bookingService = new DefaultBookingServicePort(new InMemoryBookingRepository());

    const legacyResult = await executeCreateBookingAction(
      createContext(
        { action: "create_booking", serviceName: "Consultation", dateField: "booking_date" },
        { booking_date: "2026-07-21" },
      ),
      {
        action: "create_booking",
        serviceName: "Consultation",
        dateField: "booking_date",
      },
      bookingService,
    );

    assert.equal(legacyResult.outcome, "continue");
    assert.ok(legacyResult.variables?.booking_id);

    const boundResult = await executeCreateBookingAction(
      createContext(
        {
          action: "create_booking",
          service: staticBinding("Consultation"),
          doctor: variableBinding("doctor_id"),
          location: staticBinding("main"),
          appointmentDate: variableBinding("booking_date"),
          appointmentTime: variableBinding("appointment_time"),
          customer: variableBinding("customer.id"),
        },
        {
          doctor_id: "dr_smith",
          booking_date: "2026-07-21",
          appointment_time: "10:30",
          customer: { id: "cust-1" },
        },
      ),
      {
        action: "create_booking",
        service: staticBinding("Consultation"),
        doctor: variableBinding("doctor_id"),
        location: staticBinding("main"),
        appointmentDate: variableBinding("booking_date"),
        appointmentTime: variableBinding("appointment_time"),
        customer: variableBinding("customer.id"),
      },
      bookingService,
    );

    assert.equal(boundResult.outcome, "continue");
    assert.ok(boundResult.variables?.booking_id);
  });

  it("passes structured schedulingSlot from selected_slot lookup record", async () => {
    let capturedInput: Record<string, unknown> | null = null;
    const bookingService = {
      async findBooking() {
        return { status: "not_found" as const, booking: null };
      },
      async createBooking(input: Record<string, unknown>) {
        capturedInput = input;
        return { bookingId: "sched-booking-1", bookingDate: "2026-08-02T18:15:00.000Z" };
      },
      async updateBooking() {
        return { bookingId: "sched-booking-1" };
      },
      async cancelBooking() {
        return { bookingId: "sched-booking-1", status: "Cancelled" };
      },
    };

    const result = await executeCreateBookingAction(
      createContext(
        {
          action: "create_booking",
          service: staticBinding("Clinic Visit"),
          doctor: variableBinding("selected_resource.id"),
          location: staticBinding("main"),
          appointmentDate: variableBinding("selected_date"),
          appointmentTime: variableBinding("selected_slot"),
          customer: variableBinding("customer.id"),
        },
        {
          selected_resource: { id: "resource-1" },
          selected_date: { date: "2026-08-02" },
          selected_slot: {
            start_at: "2026-08-02T18:15:00.000Z",
            end_at: "2026-08-02T18:45:00.000Z",
            display_time: "9:15 PM",
            duration_minutes: 30,
            service_id: "service-1",
            resource_id: "resource-1",
            branch_id: null,
            timezone: "Africa/Cairo",
          },
          customer: { id: "cust-1" },
        },
      ),
      {
        action: "create_booking",
        service: staticBinding("Clinic Visit"),
        doctor: variableBinding("selected_resource.id"),
        location: staticBinding("main"),
        appointmentDate: variableBinding("selected_date"),
        appointmentTime: variableBinding("selected_slot"),
        customer: variableBinding("customer.id"),
      },
      bookingService as never,
    );

    assert.equal(result.outcome, "continue");
    assert.deepEqual(capturedInput?.schedulingSlot, {
      startAt: "2026-08-02T18:15:00.000Z",
      timezone: "Africa/Cairo",
      serviceId: "service-1",
      resourceId: "resource-1",
    });
  });
});
