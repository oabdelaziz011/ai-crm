import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "../../errors.js";
import { createActionNodeHandler } from "../built-in-nodes.js";
import { executeRescheduleBookingAction } from "./reschedule-booking-action.js";
import type { ExecutionContext } from "../execution-context.js";
import { staticBinding, variableBinding } from "../../field-binding/normalize.js";
import type { BookingServicePort } from "../../ports/booking-service-port.js";
import type {
  RescheduleBookingInput,
  RescheduleBookingResult,
} from "../../crm/types/reschedule-booking-input.js";

class BookingDomainError extends Error {
  constructor(readonly codes: string[]) {
    super(codes.join(", "));
    this.name = "BookingDomainError";
  }
}

function createContext(
  config: Record<string, unknown>,
  variables: Record<string, unknown> = {},
  companyId = "company-1",
): ExecutionContext {
  return {
    company: { id: companyId },
    flow: {
      id: "flow-1",
      company_id: companyId,
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
      company_id: companyId,
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
      company_id: companyId,
      channel: "instagram",
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

const BOOKING_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NEW_BOOKING_ID = "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const successDomainResult: RescheduleBookingResult = {
  previousBooking: {
    id: BOOKING_ID,
    status: "rescheduled",
    start_at: "2026-09-20T08:00:00.000Z",
    service_id: "service-1",
    resource_id: "resource-1",
    customer_id: "cust-1",
    confirmation_number: "BK-000042",
  },
  booking: {
    id: NEW_BOOKING_ID,
    status: "confirmed",
    start_at: "2026-09-21T15:15:00.000Z",
    end_at: "2026-09-21T15:45:00.000Z",
    timezone: "Africa/Cairo",
    company_id: "company-1",
    customer_id: "cust-1",
    service_id: "service-1",
    resource_id: "resource-1",
    confirmation_number: "BK-000042",
    rescheduled_from_id: BOOKING_ID,
  },
};

function createTrackingPort(options?: {
  reschedule?: (input: RescheduleBookingInput) => Promise<RescheduleBookingResult>;
  includeReschedule?: boolean;
}): {
  port: BookingServicePort;
  calls: {
    reschedule: RescheduleBookingInput[];
    update: unknown[];
    create: unknown[];
    find: unknown[];
    cancel: unknown[];
  };
} {
  const calls = {
    reschedule: [] as RescheduleBookingInput[],
    update: [] as unknown[],
    create: [] as unknown[],
    find: [] as unknown[],
    cancel: [] as unknown[],
  };

  const port: BookingServicePort = {
    async findBooking(input) {
      calls.find.push(input);
      return { status: "not_found", count: 0 };
    },
    async createBooking(input) {
      calls.create.push(input);
      return { bookingId: "legacy-create", bookingDate: "2026-01-01" };
    },
    async updateBooking(input) {
      calls.update.push(input);
      return {
        booking: {
          id: input.bookingId,
          userId: input.userId,
          customerId: null,
          service: "",
          doctorId: null,
          locationId: null,
          bookingDate: "",
          durationMinutes: null,
          notes: null,
          status: "Pending",
        },
      };
    },
    async cancelBooking(input) {
      calls.cancel.push(input);
      return {
        booking: {
          id: input.bookingId,
          userId: input.userId,
          customerId: null,
          service: "",
          doctorId: null,
          locationId: null,
          bookingDate: "",
          durationMinutes: null,
          notes: null,
          status: "Cancelled",
        },
      };
    },
  };

  if (options?.includeReschedule !== false) {
    port.rescheduleBooking = async (input) => {
      calls.reschedule.push(input);
      if (options?.reschedule) return options.reschedule(input);
      return successDomainResult;
    };
  }

  return { port, calls };
}

const boundConfig = {
  action: "reschedule_booking",
  bookingId: variableBinding("booking.id"),
  date: variableBinding("selected_date"),
  slotStart: variableBinding("selected_slot.start_at"),
};

const boundVariables = {
  booking: { id: BOOKING_ID },
  selected_date: { date: "2026-09-21", display_date: "Mon, Sep 21", timezone: "Africa/Cairo" },
  selected_slot: {
    start_at: "2026-09-21T15:15:00.000Z",
    display_time: "5:15 PM",
    timezone: "Africa/Cairo",
    service_id: "service-1",
    resource_id: "resource-1",
  },
};

describe("executeRescheduleBookingAction", () => {
  it("delegates a successful reschedule to the scheduling port and does not touch legacy mutations", async () => {
    const { port, calls } = createTrackingPort();
    const result = await executeRescheduleBookingAction(
      createContext(boundConfig, boundVariables),
      boundConfig,
      port,
    );

    assert.equal(result.outcome, "continue");
    assert.equal(calls.reschedule.length, 1);
    assert.deepEqual(calls.reschedule[0], {
      companyId: "company-1",
      bookingId: BOOKING_ID,
      date: "2026-09-21",
      slotStart: "2026-09-21T15:15:00.000Z",
      updatedBy: "user-1",
      timezone: "Africa/Cairo",
    });
    assert.equal(calls.update.length, 0);
    assert.equal(calls.create.length, 0);
    assert.equal(calls.find.length, 0);
    assert.equal(calls.cancel.length, 0);

    const reschedule = result.variables?.reschedule as Record<string, unknown>;
    assert.equal(reschedule.success, true);
    assert.equal(reschedule.bookingId, NEW_BOOKING_ID);
    assert.equal(reschedule.previousBookingId, BOOKING_ID);
    assert.equal(reschedule.reference, "BK-000042");
    assert.equal(reschedule.startAt, "2026-09-21T15:15:00.000Z");
    assert.equal(result.variables?.booking_id, NEW_BOOKING_ID);
  });

  it("rejects a missing bookingId before calling the scheduling service", async () => {
    const { port, calls } = createTrackingPort();
    await assert.rejects(
      () =>
        executeRescheduleBookingAction(
          createContext(boundConfig, {
            selected_date: { date: "2026-09-21" },
            selected_slot: { start_at: "2026-09-21T15:15:00.000Z" },
          }),
          boundConfig,
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /bookingId/);
        return true;
      },
    );
    assert.equal(calls.reschedule.length, 0);
  });

  it("rejects a missing date before calling the scheduling service", async () => {
    const { port, calls } = createTrackingPort();
    await assert.rejects(
      () =>
        executeRescheduleBookingAction(
          createContext(boundConfig, {
            booking: { id: BOOKING_ID },
            selected_slot: { start_at: "2026-09-21T15:15:00.000Z" },
          }),
          boundConfig,
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /date/);
        return true;
      },
    );
    assert.equal(calls.reschedule.length, 0);
  });

  it("rejects a missing slotStart before calling the scheduling service", async () => {
    const { port, calls } = createTrackingPort();
    await assert.rejects(
      () =>
        executeRescheduleBookingAction(
          createContext(boundConfig, {
            booking: { id: BOOKING_ID },
            selected_date: { date: "2026-09-21" },
          }),
          boundConfig,
          port,
        ),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /slotStart/);
        return true;
      },
    );
    assert.equal(calls.reschedule.length, 0);
  });

  it("maps booking_not_found from the scheduling domain", async () => {
    const { port, calls } = createTrackingPort({
      async reschedule() {
        throw new BookingDomainError(["booking_not_found"]);
      },
    });
    const result = await executeRescheduleBookingAction(
      createContext(boundConfig, boundVariables),
      boundConfig,
      port,
    );
    assert.equal(result.outcome, "continue");
    assert.equal(calls.reschedule.length, 1);
    const reschedule = result.variables?.reschedule as Record<string, unknown>;
    assert.equal(reschedule.success, false);
    assert.deepEqual(reschedule.errors, ["booking_not_found"]);
    assert.equal(calls.update.length, 0);
  });

  it("maps slot_unavailable from the scheduling domain", async () => {
    const { port } = createTrackingPort({
      async reschedule() {
        throw new BookingDomainError(["slot_unavailable"]);
      },
    });
    const result = await executeRescheduleBookingAction(
      createContext(boundConfig, boundVariables),
      boundConfig,
      port,
    );
    const reschedule = result.variables?.reschedule as Record<string, unknown>;
    assert.equal(reschedule.success, false);
    assert.deepEqual(reschedule.errors, ["slot_unavailable"]);
  });

  it("rethrows unexpected scheduling service failures", async () => {
    const { port, calls } = createTrackingPort({
      async reschedule() {
        throw new Error("scheduling unavailable");
      },
    });
    await assert.rejects(
      () => executeRescheduleBookingAction(createContext(boundConfig, boundVariables), boundConfig, port),
      /scheduling unavailable/,
    );
    assert.equal(calls.reschedule.length, 1);
    assert.equal(calls.update.length, 0);
  });

  it("passes companyId from the execution context for tenant isolation", async () => {
    const { port, calls } = createTrackingPort({
      async reschedule(input) {
        if (input.companyId !== "company-1" || input.bookingId !== BOOKING_ID) {
          throw new BookingDomainError(["booking_not_found"]);
        }
        return successDomainResult;
      },
    });

    const foreign = await executeRescheduleBookingAction(
      createContext(boundConfig, boundVariables, "other-company"),
      boundConfig,
      port,
    );
    assert.equal(calls.reschedule[0]?.companyId, "other-company");
    const foreignResult = foreign.variables?.reschedule as Record<string, unknown>;
    assert.equal(foreignResult.success, false);
    assert.deepEqual(foreignResult.errors, ["booking_not_found"]);

    const owned = await executeRescheduleBookingAction(
      createContext(boundConfig, boundVariables, "company-1"),
      boundConfig,
      port,
    );
    assert.equal((owned.variables?.reschedule as Record<string, unknown>).success, true);
  });

  it("requires the scheduling reschedule method and never falls back to update_booking", async () => {
    const { port, calls } = createTrackingPort({ includeReschedule: false });
    await assert.rejects(
      () => executeRescheduleBookingAction(createContext(boundConfig, boundVariables), boundConfig, port),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /scheduling reschedule service/);
        return true;
      },
    );
    assert.equal(calls.update.length, 0);
    assert.equal(calls.reschedule.length, 0);
  });

  it("registers reschedule_booking on the built-in action handler", async () => {
    const { port, calls } = createTrackingPort();
    const handler = createActionNodeHandler({ bookingService: port });
    const result = await handler.execute(createContext(boundConfig, boundVariables));
    assert.equal(result.outcome, "continue");
    assert.equal(calls.reschedule.length, 1);
    assert.equal(calls.update.length, 0);
  });

  it("accepts explicit static bookingId/date/slotStart bindings", async () => {
    const { port, calls } = createTrackingPort();
    const config = {
      action: "reschedule_booking",
      bookingId: staticBinding(BOOKING_ID),
      date: staticBinding("2026-09-22"),
      slotStart: staticBinding("11:30"),
    };
    const result = await executeRescheduleBookingAction(createContext(config, {}), config, port);
    assert.equal(result.outcome, "continue");
    assert.equal(calls.reschedule[0]?.bookingId, BOOKING_ID);
    assert.equal(calls.reschedule[0]?.date, "2026-09-22");
    assert.equal(calls.reschedule[0]?.slotStart, "11:30");
  });
});
