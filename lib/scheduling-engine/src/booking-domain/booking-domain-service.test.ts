import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlotGenerationEngine } from "../slot-generation-engine/slot-generation-engine.js";
import { BookingDomainService } from "./booking-domain-service.js";
import type { SchedulingBooking, SchedulingBookingInsert } from "./types.js";

describe("BookingDomainService.rescheduleBooking", () => {
  it("keeps the visit type and price of the original booking", async () => {
    const original: SchedulingBooking = {
      id: "booking-old",
      company_id: "company-1",
      branch_id: null,
      customer_id: "customer-1",
      resource_id: "resource-1",
      service_id: "service-1",
      start_at: "2026-10-15T06:00:00.000Z",
      end_at: "2026-10-15T06:10:00.000Z",
      timezone: "Africa/Cairo",
      status: "confirmed",
      source: "whatsapp",
      notes: null,
      rescheduled_from_id: null,
      version: 1,
      created_by: null,
      updated_by: null,
      created_at: "2026-10-14T19:00:00.000Z",
      updated_at: "2026-10-14T19:00:00.000Z",
      deleted_at: null,
      confirmation_number: "BK-000094",
      amount_cents: 5000,
      currency: "USD",
      visit_type: "Consultation",
      payment_status: "pending",
      discount_cents: 0,
      tax_cents: 0,
    };
    const inserted: SchedulingBookingInsert[] = [];
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        getById: async () => original,
        updateStatus: async () => ({ ...original, status: "rescheduled" }),
        create: async (values: SchedulingBookingInsert) => {
          inserted.push(values);
          return { ...original, ...values, id: "booking-new" };
        },
      },
      validationService: {
        validateRescheduleInput: () => null,
        validateReschedulePolicy: async () => ({ valid: true, errors: [] }),
        validateBooking: async () => ({
          valid: true,
          errors: [],
          context: {
            startAt: "2026-10-17T08:00:00.000Z",
            endAt: "2026-10-17T08:10:00.000Z",
            timezone: "Africa/Cairo",
          },
        }),
      },
    });

    await service.rescheduleBooking({
      companyId: "company-1",
      bookingId: "booking-old",
      date: "2026-10-17",
      slotStart: "10:00",
    });

    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.visit_type, "Consultation");
    assert.equal(inserted[0]?.amount_cents, 5000);
    assert.equal(inserted[0]?.currency, "USD");
    assert.equal(inserted[0]?.payment_status, "pending");
    assert.equal(inserted[0]?.confirmation_number, undefined);
    assert.equal(inserted[0]?.rescheduled_from_id, "booking-old");
  });

  it("puts the original booking back when the replacement cannot be saved", async () => {
    const original = {
      id: "booking-old",
      company_id: "company-1",
      status: "confirmed",
      confirmation_number: "BK-000097",
      updated_by: "user-0",
    } as SchedulingBooking;
    const statusWrites: Array<{ id: string; status: string; updatedBy: string | null }> = [];
    const service = new BookingDomainService({} as SupabaseClient, {} as SlotGenerationEngine);
    Object.assign(service, {
      bookingRepo: {
        getById: async () => original,
        updateStatus: async (id: string, _companyId: string, status: string, updatedBy: string | null) => {
          statusWrites.push({ id, status, updatedBy });
          return { ...original, status };
        },
        create: async () => {
          throw new Error('duplicate key value violates unique constraint "idx_scheduling_bookings_company_confirmation_number"');
        },
      },
      validationService: {
        validateRescheduleInput: () => null,
        validateReschedulePolicy: async () => ({ valid: true, errors: [] }),
        validateBooking: async () => ({
          valid: true,
          errors: [],
          context: { startAt: "2026-10-15T04:30:00.000Z", endAt: "2026-10-15T05:00:00.000Z", timezone: "Africa/Cairo" },
        }),
      },
    });

    await assert.rejects(
      service.rescheduleBooking({
        companyId: "company-1",
        bookingId: "booking-old",
        date: "2026-10-15",
        slotStart: "07:30",
        updatedBy: "user-1",
      }),
      /duplicate key/,
    );

    assert.deepEqual(statusWrites, [
      { id: "booking-old", status: "rescheduled", updatedBy: "user-1" },
      { id: "booking-old", status: "confirmed", updatedBy: "user-0" },
    ]);
  });
});
