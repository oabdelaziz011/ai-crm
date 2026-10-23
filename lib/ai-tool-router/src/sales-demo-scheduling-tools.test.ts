import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSchedulingAgentTools,
  CREATE_BOOKING_TOOL_KEY,
  CREATE_DEMO_BOOKING_TOOL_KEY,
  LIST_DEMO_TYPES_TOOL_KEY,
  SALES_DEMO_TOOL_KEYS,
  resolveLlmToolExposure,
  listRegisteredToolHandlerKeys,
} from "./index.js";
import type { SchedulingToolPorts } from "./tools/scheduling-agent-ports.js";

function createStubSchedulingPorts(
  overrides: Partial<SchedulingToolPorts> = {},
): SchedulingToolPorts {
  return {
    async searchAvailability() {
      return {
        success: true,
        serviceId: "service-1",
        durationMinutes: 30,
        availableDates: [],
        resources: [],
      };
    },
    async findNextAvailable() {
      return {
        success: false,
        searchedWindow: 7,
        slot: null,
        message: "none",
      };
    },
    async recommendAppointment() {
      return {
        success: false,
        searchedWindow: 7,
        recommendations: [],
        alternativeResource: null,
        alternativeBranch: null,
        nearestDate: null,
        message: "none",
      };
    },
    async createBooking() {
      return { success: false, message: "not configured" };
    },
    async searchBookings() {
      return { success: true, bookings: [], total: 0 };
    },
    async rescheduleBooking() {
      return { success: false, message: "not configured" };
    },
    async cancelBooking() {
      return { success: false, message: "not configured" };
    },
    async checkInBooking() {
      return { success: false, message: "not configured" };
    },
    async checkOutBooking() {
      return { success: false, message: "not configured" };
    },
    async listDemoTypes() {
      return {
        success: true,
        demos: [
          {
            serviceId: "demo-1",
            name: "Product walkthrough",
            durationMinutes: 30,
            description: null,
          },
        ],
      };
    },
    async searchDemoAvailability() {
      return {
        success: true,
        serviceId: "demo-1",
        durationMinutes: 30,
        availableDates: [],
        resources: [],
      };
    },
    async findNextDemo() {
      return {
        success: true,
        searchedWindow: 7,
        slot: {
          date: "2026-12-01",
          start: "10:00",
          end: "10:30",
          resourceId: "resource-demo",
          resourceName: "Demo room",
        },
      };
    },
    async createDemoBooking() {
      return { success: false, message: "not configured" };
    },
    ...overrides,
  };
}

describe("sales demo scheduling tools", () => {
  it("registers additive demo tools without removing clinic create_booking", () => {
    const keys = listRegisteredToolHandlerKeys({
      schedulingToolPorts: createStubSchedulingPorts(),
    });
    assert.ok(keys.includes(CREATE_BOOKING_TOOL_KEY));
    for (const key of SALES_DEMO_TOOL_KEYS) {
      assert.ok(keys.includes(key), `missing ${key}`);
    }
  });

  it("exposes demo tools in the LLM catalog when scheduling ports are wired", () => {
    const exposure = resolveLlmToolExposure(
      listRegisteredToolHandlerKeys({
        schedulingToolPorts: createStubSchedulingPorts(),
      }),
    );
    assert.ok(exposure.allowedToolKeys.includes(LIST_DEMO_TYPES_TOOL_KEY));
    assert.ok(exposure.allowedToolKeys.includes(CREATE_DEMO_BOOKING_TOOL_KEY));
    assert.ok(exposure.allowedToolKeys.includes(CREATE_BOOKING_TOOL_KEY));
  });

  it("lists only sales_demo types from list_demo_types", async () => {
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async listDemoTypes() {
          return {
            success: true,
            demos: [
              { serviceId: "demo-a", name: "Demo A", durationMinutes: 45, description: null },
              { serviceId: "demo-b", name: "Demo B", durationMinutes: 30, description: null },
            ],
          };
        },
      }),
    );

    const result = await tools.list_demo_types.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "idle",
        userId: "user-1",
      },
      {},
    );

    assert.equal(result.success, true);
    assert.equal(Array.isArray(result.demos) && result.demos.length, 2);
    assert.equal(result.demos[0].serviceId, "demo-a");
  });

  it("create_demo_booking allows omitted resourceId (auto-assign path)", async () => {
    let captured: Record<string, unknown> | null = null;
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking(input) {
          captured = { ...input };
          return {
            success: true,
            bookingId: "booking-demo-1",
            confirmationNumber: "BK-000301",
            status: "confirmed",
            startAt: "2026-10-21T08:00:00.000Z",
            endAt: "2026-10-21T08:30:00.000Z",
            resourceId: "resource-auto",
            serviceName: "Product walkthrough",
          };
        },
      }),
    );

    const result = await tools.create_demo_booking.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "idle",
        userId: "user-1",
        trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
      },
      {
        customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
        serviceId: "demo-1",
        date: "2026-12-01",
        slotStart: "10:00",
        clientRequestId: "idem-demo-1",
      },
    );

    assert.equal(result.success, true);
    assert.equal(captured?.resourceId, undefined);
    assert.equal(captured?.clientRequestId, "idem-demo-1");
    assert.equal(captured?.serviceId, "demo-1");
  });

  it("clinic create_booking still requires resourceId in the tool schema", () => {
    const tools = createSchedulingAgentTools(createStubSchedulingPorts());
    assert.throws(
      () =>
        tools.create_booking.validate({
          customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
          serviceId: "service-1",
          date: "2026-12-01",
          slotStart: "10:00",
        }),
    );
  });

  it("rejects create_demo_booking when ports report service_kind_mismatch", async () => {
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking() {
          return {
            success: false,
            errors: ["service_kind_mismatch"],
            message: "not a demo",
            customerFacingMessage: "الخدمة دي مش عرض منتج.",
          };
        },
      }),
    );

    const result = await tools.create_demo_booking.execute(
      {
        companyId: "company-1",
        conversationId: "conv-1",
        conversationState: "idle",
        userId: "user-1",
        trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
      },
      {
        customerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
        serviceId: "clinic-service",
        resourceId: "resource-1",
        date: "2026-12-01",
        slotStart: "10:00",
      },
    );

    assert.equal(result.success, false);
    assert.ok(Array.isArray(result.errors) && result.errors.includes("service_kind_mismatch"));
  });
});

describe("create_demo_booking human handoff", () => {
  const customerId = "1e6e345e-5180-46fc-9f2b-01f832a6a432";
  const ctx = {
    companyId: "company-1",
    conversationId: "conv-1",
    conversationState: "waiting_user" as const,
    userId: "user-1",
    trustedCustomerId: customerId,
  };
  const input = {
    customerId,
    serviceId: "demo-1",
    date: "2026-12-01",
    slotStart: "10:00",
    clientRequestId: "idem-demo-handoff",
  };

  it("books once, then hands the conversation to a human", async () => {
    const { evaluateInboundAiGate } = await import("@workspace/human-handoff-platform");
    let bookings = 0;
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking() {
          bookings += 1;
          return {
            success: true,
            bookingId: "booking-demo-1",
            confirmationNumber: "BK-000301",
            status: "confirmed",
          };
        },
        async handoffAfterDemoBooking() {
          return { succeeded: true, ownerType: "human_agent", assigned: true, queued: false };
        },
      }),
    );
    const result = await tools.create_demo_booking.execute(ctx, input);
    assert.equal(bookings, 1);
    assert.equal(result.success, true);
    assert.equal(result.handoffSucceeded, true);
    assert.equal(result.handoffOwnerType, "human_agent");
    const gate = evaluateInboundAiGate({
      ownership: { ownerType: "human_agent", isPaused: false, assignedUserId: "agent-1" },
    });
    assert.equal(gate.allowAutomatedReply, false);
    assert.equal(gate.reason, "owner_human_agent");
  });

  it("keeps the booking and does not retry when handoff fails", async () => {
    let bookings = 0;
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking() {
          bookings += 1;
          return { success: true, bookingId: "booking-demo-2", confirmationNumber: "BK-000302", status: "confirmed" };
        },
        async handoffAfterDemoBooking() {
          throw new Error("handoff down");
        },
      }),
    );
    const result = await tools.create_demo_booking.execute(ctx, input);
    assert.equal(bookings, 1);
    assert.equal(result.bookingPersisted, true);
    assert.equal(result.handoffSucceeded, false);
    assert.equal(result.handoffError, "handoff down");
    assert.match(String(result.instruction), /Do not book again/);
    assert.doesNotMatch(String(result.customerFacingMessage), /هيكمل معاك/);
  });

  it("books from the trusted customer without asking for a customer id, once, then hands off", async () => {
    let bookings = 0;
    let handoffs = 0;
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking() {
          bookings += 1;
          return { success: true, bookingId: "booking-demo-3", confirmationNumber: "BK-000303", status: "confirmed" };
        },
        async handoffAfterDemoBooking() {
          handoffs += 1;
          return { succeeded: true, ownerType: "human_agent", assigned: true, queued: false };
        },
      }),
    );
    assert.doesNotThrow(() =>
      tools.create_demo_booking.validate({
        serviceId: "demo-1",
        date: "2026-12-01",
        slotStart: "11:00",
      }),
    );
    assert.throws(() =>
      tools.create_demo_booking.validate({
        serviceId: "demo-1",
        slotStart: "11:00",
      }),
    );
    const result = await tools.create_demo_booking.execute(ctx, {
      serviceId: "demo-1",
      date: "2026-12-01",
      slotStart: "11:00",
    });
    assert.equal(bookings, 1);
    assert.equal(handoffs, 1);
    assert.equal(result.handoffSucceeded, true);
    assert.match(String(result.customerFacingMessage), /BK-000303/);
  });

  it("does not book or hand off when the date is in the past", async () => {
    let bookings = 0;
    let handoffs = 0;
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking() {
          bookings += 1;
          return { success: true, bookingId: "booking-demo-4", confirmationNumber: "BK-000304", status: "confirmed" };
        },
        async handoffAfterDemoBooking() {
          handoffs += 1;
          return { succeeded: true, ownerType: "human_agent", assigned: true, queued: false };
        },
      }),
    );
    const result = await tools.create_demo_booking.execute(ctx, {
      serviceId: "demo-1",
      date: "2023-10-22",
      slotStart: "10:00",
    });
    assert.equal(bookings, 0);
    assert.equal(handoffs, 0);
    assert.equal(result.success, false);
    assert.equal(result.bookingPersisted, false);
    assert.equal(result.handoffSucceeded, false);
    assert.match(String(result.customerFacingMessage), /تاريخ/);
    assert.doesNotMatch(String(result.customerFacingMessage), /date_not_bookable/);
  });

  it("resolves today and tomorrow to the Cairo calendar and does not persist a declined slot", async () => {
    const seen: Array<{ date: string; serviceId: string; slotStart: string }> = [];
    const tools = createSchedulingAgentTools(
      createStubSchedulingPorts({
        async createDemoBooking(input) {
          seen.push({
            date: input.date,
            serviceId: input.serviceId,
            slotStart: input.slotStart,
          });
          return {
            success: false,
            errors: ["slot_unavailable"],
            message: "The fake adapter declined the slot.",
            bookingPersisted: false,
          };
        },
      }),
    );
    const ctx = {
      companyId: "company-1",
      conversationId: "conv-1",
      conversationState: "idle" as const,
      userId: "user-1",
      trustedCustomerId: "1e6e345e-5180-46fc-9f2b-01f832a6a432",
    };
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const todayResult = await tools.create_demo_booking.execute(ctx, {
      serviceId: "979845ef-bcae-43a0-a81c-6e9cd657d7bd",
      date: "today",
      slotStart: "15:00",
    });
    const tomorrowResult = await tools.create_demo_booking.execute(ctx, {
      serviceId: "979845ef-bcae-43a0-a81c-6e9cd657d7bd",
      date: "tomorrow",
      slotStart: "15:00",
    });
    assert.equal(todayResult.success, false);
    assert.equal(todayResult.bookingPersisted, false);
    assert.equal(tomorrowResult.success, false);
    assert.equal(seen[0]?.date, today);
    assert.equal(seen[0]?.serviceId, "979845ef-bcae-43a0-a81c-6e9cd657d7bd");
    assert.notEqual(seen[1]?.date, today);
    assert.throws(() =>
      tools.create_demo_booking.validate({
        serviceId: "979845ef-bcae-43a0-a81c-6e9cd657d7bd",
        date: "today",
      }),
    );
  });
});
