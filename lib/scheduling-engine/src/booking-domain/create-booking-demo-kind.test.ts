import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlotGenerationEngine } from "../slot-generation-engine/slot-generation-engine.js";
import { BookingDomainError, BookingDomainService } from "./booking-domain-service.js";
import type { SchedulingBooking, SchedulingBookingInsert } from "./types.js";

function baseBooking(overrides: Partial<SchedulingBooking> = {}): SchedulingBooking {
  return {
    id: "booking-1",
    company_id: "company-1",
    branch_id: null,
    customer_id: "customer-1",
    resource_id: "resource-1",
    service_id: "service-1",
    start_at: "2026-10-20T08:00:00.000Z",
    end_at: "2026-10-20T08:30:00.000Z",
    timezone: "Africa/Cairo",
    status: "confirmed",
    source: "ai_assistant",
    notes: null,
    rescheduled_from_id: null,
    version: 1,
    created_by: "user-1",
    updated_by: "user-1",
    created_at: "2026-10-19T19:00:00.000Z",
    updated_at: "2026-10-19T19:00:00.000Z",
    deleted_at: null,
    confirmation_number: "BK-000201",
    amount_cents: 0,
    currency: "USD",
    visit_type: "New",
    payment_status: "pending",
    discount_cents: 0,
    tax_cents: 0,
    ...overrides,
  };
}

describe("BookingDomainService.createBooking service kind + idempotency", () => {
  it("rejects service_kind_mismatch when expectedServiceKind does not match", async () => {
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async () => null,
        findOverlapping: async () => null,
        create: async () => {
          throw new Error("should not create");
        },
      },
      validationService: {
        validateCreateInput: () => null,
        validateBooking: async () => ({
          valid: false,
          errors: ["service_kind_mismatch"],
        }),
        resolvePricingSnapshot: async () => ({
          priceCents: 0,
          currency: "USD",
          typeCode: "New",
        }),
      },
      eventPublisher: { publish: async () => undefined },
    });

    await assert.rejects(
      () =>
        service.createBooking({
          companyId: "company-1",
          customerId: "customer-1",
          resourceId: "resource-1",
          serviceId: "clinic-service",
          date: "2026-10-20",
          slotStart: "10:00",
          source: "ai_assistant",
          expectedServiceKind: "sales_demo",
        }),
      (error: unknown) =>
        error instanceof BookingDomainError && error.codes.includes("service_kind_mismatch"),
    );
  });

  it("creates operational bookings without clientRequestId (clinic path unchanged)", async () => {
    const inserted: SchedulingBookingInsert[] = [];
    let findByClientRequestIdCalls = 0;
    const created = baseBooking({ id: "booking-ops" });
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async () => {
          findByClientRequestIdCalls += 1;
          return null;
        },
        findOverlapping: async () => null,
        create: async (values: SchedulingBookingInsert) => {
          inserted.push(values);
          return { ...created, ...values };
        },
      },
      validationService: {
        validateCreateInput: () => null,
        validateBooking: async () => ({
          valid: true,
          errors: [],
          context: {
            startAt: "2026-10-20T08:00:00.000Z",
            endAt: "2026-10-20T08:30:00.000Z",
            timezone: "Africa/Cairo",
            branchId: null,
          },
        }),
        resolvePricingSnapshot: async () => ({
          priceCents: 1000,
          currency: "USD",
          typeCode: "New",
        }),
      },
      eventPublisher: { publish: async () => undefined },
    });

    const result = await service.createBooking({
      companyId: "company-1",
      customerId: "customer-1",
      resourceId: "resource-1",
      serviceId: "service-1",
      date: "2026-10-20",
      slotStart: "10:00",
      source: "whatsapp",
      createdBy: "user-1",
    });

    assert.equal(findByClientRequestIdCalls, 0);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.client_request_id, undefined);
    assert.equal(result.booking.id, "booking-ops");
  });

  it("returns the existing booking when clientRequestId already exists", async () => {
    const existing = baseBooking({
      id: "booking-existing",
      client_request_id: "demo-req-1",
    });
    let createCalls = 0;
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async (_companyId: string, key: string) => {
          assert.equal(key, "demo-req-1");
          return existing;
        },
        create: async () => {
          createCalls += 1;
          throw new Error("should not create");
        },
      },
      validationService: {
        validateCreateInput: () => null,
      },
      eventPublisher: { publish: async () => undefined },
    });

    const result = await service.createBooking({
      companyId: "company-1",
      customerId: "customer-1",
      resourceId: "resource-1",
      serviceId: "demo-service",
      date: "2026-10-20",
      slotStart: "10:00",
      source: "ai_assistant",
      clientRequestId: "demo-req-1",
      expectedServiceKind: "sales_demo",
    });

    assert.equal(createCalls, 0);
    assert.equal(result.booking.id, "booking-existing");
  });

  it("reclaims the winner when concurrent create hits client_request_id unique violation", async () => {
    const winner = baseBooking({
      id: "booking-winner",
      client_request_id: "race-req",
    });
    let createCalls = 0;
    let publishCalls = 0;
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async () => {
          // Both racers miss the pre-check; post-conflict lookup finds the winner.
          return createCalls > 0 ? winner : null;
        },
        findOverlapping: async () => null,
        create: async () => {
          createCalls += 1;
          if (createCalls === 1) {
            return baseBooking({ id: "booking-winner", client_request_id: "race-req" });
          }
          const err = new Error(
            'duplicate key value violates unique constraint "idx_scheduling_bookings_company_client_request_id"',
          ) as Error & { code: string };
          err.code = "23505";
          throw err;
        },
      },
      validationService: {
        validateCreateInput: () => null,
        validateBooking: async () => ({
          valid: true,
          errors: [],
          context: {
            startAt: "2026-10-20T08:00:00.000Z",
            endAt: "2026-10-20T08:30:00.000Z",
            timezone: "Africa/Cairo",
            branchId: null,
          },
        }),
        resolvePricingSnapshot: async () => ({
          priceCents: 0,
          currency: "USD",
          typeCode: "New",
        }),
      },
      eventPublisher: {
        publish: async () => {
          publishCalls += 1;
        },
      },
    });

    const input = {
      companyId: "company-1",
      customerId: "customer-1",
      resourceId: "resource-demo",
      serviceId: "demo-service",
      date: "2026-10-20",
      slotStart: "11:00",
      source: "ai_assistant" as const,
      clientRequestId: "race-req",
      expectedServiceKind: "sales_demo" as const,
    };

    const [a, b] = await Promise.all([
      service.createBooking(input),
      service.createBooking(input),
    ]);

    assert.equal(a.booking.id, "booking-winner");
    assert.equal(b.booking.id, "booking-winner");
    assert.equal(createCalls, 2);
    // Only the successful insert publishes created; reclaim returns without a second event.
    assert.equal(publishCalls, 1);
  });

  it("does not reclaim on unrelated unique violations", async () => {
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async () => null,
        findOverlapping: async () => null,
        create: async () => {
          const err = new Error(
            'duplicate key value violates unique constraint "scheduling_bookings_pkey"',
          ) as Error & { code: string };
          err.code = "23505";
          throw err;
        },
      },
      validationService: {
        validateCreateInput: () => null,
        validateBooking: async () => ({
          valid: true,
          errors: [],
          context: {
            startAt: "2026-10-20T08:00:00.000Z",
            endAt: "2026-10-20T08:30:00.000Z",
            timezone: "Africa/Cairo",
            branchId: null,
          },
        }),
        resolvePricingSnapshot: async () => ({
          priceCents: 0,
          currency: "USD",
          typeCode: "New",
        }),
      },
      eventPublisher: { publish: async () => undefined },
    });

    await assert.rejects(
      () =>
        service.createBooking({
          companyId: "company-1",
          customerId: "customer-1",
          resourceId: "resource-demo",
          serviceId: "demo-service",
          date: "2026-10-20",
          slotStart: "11:00",
          source: "ai_assistant",
          clientRequestId: "race-req",
          expectedServiceKind: "sales_demo",
        }),
      /scheduling_bookings_pkey/,
    );
  });

  it("persists client_request_id and expectedServiceKind on demo create", async () => {
    const inserted: SchedulingBookingInsert[] = [];
    let expectedKind: string | null | undefined;
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        findByClientRequestId: async () => null,
        findOverlapping: async () => null,
        create: async (values: SchedulingBookingInsert) => {
          inserted.push(values);
          return baseBooking({ ...values, id: "booking-demo" });
        },
      },
      validationService: {
        validateCreateInput: () => null,
        validateBooking: async (params: { expectedServiceKind?: string | null }) => {
          expectedKind = params.expectedServiceKind;
          return {
            valid: true,
            errors: [],
            context: {
              startAt: "2026-10-20T08:00:00.000Z",
              endAt: "2026-10-20T08:30:00.000Z",
              timezone: "Africa/Cairo",
              branchId: null,
            },
          };
        },
        resolvePricingSnapshot: async () => ({
          priceCents: 0,
          currency: "USD",
          typeCode: "New",
        }),
      },
      eventPublisher: { publish: async () => undefined },
    });

    await service.createBooking({
      companyId: "company-1",
      customerId: "customer-1",
      resourceId: "resource-demo",
      serviceId: "demo-service",
      date: "2026-10-20",
      slotStart: "11:00",
      source: "ai_assistant",
      clientRequestId: "idem-42",
      expectedServiceKind: "sales_demo",
    });

    assert.equal(expectedKind, "sales_demo");
    assert.equal(inserted[0]?.client_request_id, "idem-42");
    assert.equal(inserted[0]?.resource_id, "resource-demo");
  });
});
