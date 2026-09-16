import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import { readOutboundQueue } from "../../runtime/outbound-queue.js";
import type { ExecutionContext } from "../execution-context.js";
import { executeRescheduleBookingAction } from "./reschedule-booking-action.js";

function context(variables: Record<string, unknown>): ExecutionContext {
  const now = new Date().toISOString();
  return {
    company: { id: "company-1" },
    flow: {
      id: "flow-1", company_id: "company-1", name: "Flow", description: "",
      trigger_type: "inbound_message", status: "active", version: 1, metadata: {},
      active_version_id: null, has_unpublished_draft: false, created_by: null,
      updated_by: null, created_at: now, updated_at: now, deleted_at: null, deleted_by: null,
    },
    run: {
      id: "run-1", company_id: "company-1", flow_id: "flow-1", session_id: "session-1",
      status: "running", trigger_source: "manual", current_node_id: "node-1", variables,
      metadata: { actorUserId: "user-1" }, error_message: null, started_at: now, finished_at: null,
    },
    session: {
      id: "session-1", company_id: "company-1", channel: "instagram",
      external_user_id: "ext-1", customer_id: "customer-1", flow_id: "flow-1",
      run_id: "run-1", current_node_id: "node-1", status: "running",
      started_at: now, last_activity_at: now, metadata: {}, variables,
    },
    variables,
    customer: { id: "customer-1" },
    currentNode: {
      id: "node-1", flow_id: "flow-1", type: "action",
      config: { action: "reschedule_booking", bookingId: "{{booking.id}}" },
      position_x: 0, position_y: 0, created_at: now,
    },
    nodes: [],
    edges: [],
  };
}

function service(capture: { input?: unknown }): BookingServicePort {
  return {
    async findBooking() { return { status: "not_found", count: 0 }; },
    async createBooking() { return { bookingId: "unused", bookingDate: "" }; },
    async updateBooking() { throw new Error("unused"); },
    async cancelBooking() { throw new Error("unused"); },
    async rescheduleBooking(input) {
      capture.input = input;
      return {
        previousBookingId: input.bookingId,
        confirmationNumber: "BK-000004",
        booking: {
          id: "new-booking-id",
          userId: input.userId,
          customerId: "customer-1",
          service: "service-1",
          doctorId: "resource-1",
          locationId: "branch-1",
          bookingDate: "2026-09-20T07:00:00.000Z",
          durationMinutes: 30,
          notes: null,
          status: "confirmed",
        },
      };
    },
  };
}

describe("executeRescheduleBookingAction", () => {
  it("reschedules the selected booking and queues a localized success message", async () => {
    const capture: { input?: unknown } = {};
    const result = await executeRescheduleBookingAction(
      context({
        conversation: { language: "ar" },
        booking: {
          id: "old-booking-id",
          confirmation_number: "BK-000004",
          service_id: "service-1",
          resource_id: "resource-1",
          resource_name: "د. عمر",
        },
        selected_date: { date: "2026-09-20", display_date: "الأحد 20 سبتمبر", timezone: "Africa/Cairo" },
        selected_slot: { start_at: "2026-09-20T07:00:00.000Z", display_time: "10:00 ص", timezone: "Africa/Cairo" },
      }),
      { action: "reschedule_booking", bookingId: "{{booking.id}}" },
      service(capture),
    );

    assert.deepEqual(capture.input, {
      companyId: "company-1",
      userId: "user-1",
      bookingId: "old-booking-id",
      schedulingSlot: {
        startAt: "2026-09-20T07:00:00.000Z",
        timezone: "Africa/Cairo",
      },
    });
    assert.equal(result.variables?.booking_id, "new-booking-id");
    assert.equal((result.variables?.booking as Record<string, unknown>).rescheduled_from_id, "old-booking-id");
    assert.match(readOutboundQueue(result.variables ?? {})[0]?.text ?? "", /تم تغيير ميعاد الكشف بنجاح/);
  });

  it("rejects execution when no scheduling slot was selected", async () => {
    await assert.rejects(
      executeRescheduleBookingAction(
        context({ booking: { id: "old-booking-id" } }),
        { action: "reschedule_booking" },
        service({}),
      ),
      /selected scheduling slot/,
    );
  });
});
