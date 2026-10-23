import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCreateDemoBooking } from "./adapters/scheduling-tool-ports.js";
import type {
  BookingDomainServicePort,
  SchedulingEnginePort,
} from "./tools/scheduling-agent-ports.js";

function createServiceClient(kind: "sales_demo" | "operational"): SupabaseClient {
  return {
    from(table: string) {
      assert.equal(table, "scheduling_services");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        maybeSingle: async () => ({
          data: {
            id: "svc-1",
            name: kind === "sales_demo" ? "Product demo" : "Cleaning",
            duration_minutes: 30,
            status: "active",
            service_kind: kind,
          },
          error: null,
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("executeCreateDemoBooking auto-assign", () => {
  it("creates sales_demo bookings with an explicit resourceId and expectedServiceKind", async () => {
    let captured: { resourceId?: string; expectedServiceKind?: string | null; clientRequestId?: string | null } =
      {};
    const engines = {} as SchedulingEnginePort;

    const bookingDomain: BookingDomainServicePort = {
      async createBooking(input) {
        captured = {
          resourceId: input.resourceId,
          expectedServiceKind: input.expectedServiceKind,
          clientRequestId: input.clientRequestId,
        };
        return {
          booking: {
            id: "b-1",
            company_id: input.companyId,
            customer_id: input.customerId,
            resource_id: input.resourceId,
            status: "confirmed",
            start_at: "2026-10-21T08:00:00.000Z",
            end_at: "2026-10-21T08:30:00.000Z",
            confirmation_number: "BK-000401",
          },
        };
      },
    };

    const result = await executeCreateDemoBooking(
      createServiceClient("sales_demo"),
      engines,
      bookingDomain,
      {
        companyId: "company-1",
        userId: "user-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        resourceId: "resource-chosen",
        date: "2026-10-21",
        slotStart: "10:00",
        clientRequestId: "req-1",
      },
    );

    assert.equal(result.success, true);
    assert.equal(captured.resourceId, "resource-chosen");
    assert.equal(captured.expectedServiceKind, "sales_demo");
    assert.equal(captured.clientRequestId, "req-1");
  });

  it("rejects operational services (service_kind_mismatch)", async () => {
    const bookingDomain = {
      async createBooking() {
        throw new Error("should not create");
      },
    } as unknown as BookingDomainServicePort;
    const engines = {} as SchedulingEnginePort;

    const result = await executeCreateDemoBooking(
      createServiceClient("operational"),
      engines,
      bookingDomain,
      {
        companyId: "company-1",
        userId: "user-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        resourceId: "resource-1",
        date: "2026-10-21",
        slotStart: "10:00",
      },
    );

    assert.equal(result.success, false);
    assert.ok(result.errors?.includes("service_kind_mismatch"));
  });

  it("rejects ineligible resources (capability_missing from resource_services mapping)", async () => {
    const { BookingDomainError } = await import("@workspace/scheduling-engine");
    const bookingDomain: BookingDomainServicePort = {
      async createBooking() {
        throw new BookingDomainError(["capability_missing"]);
      },
    };
    const engines = {} as SchedulingEnginePort;

    const result = await executeCreateDemoBooking(
      createServiceClient("sales_demo"),
      engines,
      bookingDomain,
      {
        companyId: "company-1",
        userId: "user-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        resourceId: "resource-not-mapped",
        date: "2026-10-21",
        slotStart: "10:00",
      },
    );

    assert.equal(result.success, false);
    assert.ok(result.errors?.includes("capability_missing"));
  });

  it("rejects unavailable slots without creating a booking", async () => {
    const { BookingDomainError } = await import("@workspace/scheduling-engine");
    let createCalls = 0;
    const bookingDomain: BookingDomainServicePort = {
      async createBooking() {
        createCalls += 1;
        throw new BookingDomainError(["slot_unavailable"]);
      },
    };

    const result = await executeCreateDemoBooking(
      createServiceClient("sales_demo"),
      {} as SchedulingEnginePort,
      bookingDomain,
      {
        companyId: "company-1",
        userId: "user-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        resourceId: "resource-eligible-but-busy",
        date: "2026-10-21",
        slotStart: "10:00",
      },
    );

    assert.equal(result.success, false);
    assert.ok(result.errors?.includes("slot_unavailable"));
    assert.equal(createCalls, 1);
  });
});
