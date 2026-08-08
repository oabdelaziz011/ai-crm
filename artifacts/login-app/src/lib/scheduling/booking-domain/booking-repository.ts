import type { SupabaseClient } from "@supabase/supabase-js";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import { parseTimeToMinutes } from "@/lib/scheduling/availability-engine/period-utils";
import type { ExistingBooking } from "@/lib/scheduling/slot-generation-engine/types";
import {
  ACTIVE_BOOKING_STATUSES,
  type SchedulingBooking,
  type SchedulingBookingInsert,
  type SchedulingBookingStatus,
} from "@/lib/scheduling/booking-domain/types";

export class BookingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getById(id: string, companyId: string): Promise<SchedulingBooking | null> {
    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as SchedulingBooking | null) ?? null;
  }

  async create(values: SchedulingBookingInsert): Promise<SchedulingBooking> {
    const { data, error } = await this.client
      .from("scheduling_bookings")
      .insert({
        ...values,
        status: values.status ?? "confirmed",
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingBooking;
  }

  async updateStatus(
    id: string,
    companyId: string,
    status: SchedulingBookingStatus,
    updatedBy: string | null,
    notes?: string | null,
  ): Promise<SchedulingBooking> {
    const payload: Record<string, unknown> = {
      status,
      updated_by: updatedBy,
    };
    if (notes !== undefined) {
      payload.notes = notes;
    }

    const { data, error } = await this.client
      .from("scheduling_bookings")
      .update(payload)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingBooking;
  }

  async updatePaymentState(
    id: string,
    companyId: string,
    input: {
      invoiceId?: string | null;
      paymentStatus: string;
      discountCents?: number;
      taxCents?: number;
      updatedBy?: string | null;
    },
  ): Promise<SchedulingBooking> {
    const payload: Record<string, unknown> = {
      payment_status: input.paymentStatus,
      updated_by: input.updatedBy ?? null,
    };
    if (input.invoiceId !== undefined) payload.invoice_id = input.invoiceId;
    if (input.discountCents !== undefined) payload.discount_cents = input.discountCents;
    if (input.taxCents !== undefined) payload.tax_cents = input.taxCents;

    const { data, error } = await this.client
      .from("scheduling_bookings")
      .update(payload)
      .eq("id", id)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return data as SchedulingBooking;
  }

  async findOverlapping(
    companyId: string,
    resourceId: string,
    startAt: string,
    endAt: string,
    excludeBookingId?: string,
  ): Promise<SchedulingBooking | null> {
    let query = this.client
      .from("scheduling_bookings")
      .select("*")
      .eq("company_id", companyId)
      .eq("resource_id", resourceId)
      .is("deleted_at", null)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .lt("start_at", endAt)
      .gt("end_at", startAt);

    if (excludeBookingId) {
      query = query.neq("id", excludeBookingId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as SchedulingBooking | null) ?? null;
  }

  async listByResourceAndDate(
    companyId: string,
    resourceId: string,
    date: string,
    timezone: string,
  ): Promise<ExistingBooking[]> {
    const rows = await this.listByResourcesAndDate(companyId, [resourceId], date, timezone);
    return rows.get(resourceId) ?? [];
  }

  async listByResourcesAndDate(
    companyId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
  ): Promise<Map<string, ExistingBooking[]>> {
    const result = new Map<string, ExistingBooking[]>();
    for (const id of resourceIds) {
      result.set(id, []);
    }

    if (resourceIds.length === 0) {
      return result;
    }

    const { startIso, endIso } = BookingRepository.dayQueryBounds(date);

    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("id, resource_id, start_at, end_at, status, timezone")
      .eq("company_id", companyId)
      .in("resource_id", resourceIds)
      .is("deleted_at", null)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .gte("start_at", startIso)
      .lte("start_at", endIso);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const localDate = TimezoneResolver.localDateForInstant(
        TimezoneResolver.parseInstant(row.start_at),
        timezone,
      );
      if (localDate !== date) continue;

      const startMinutes = parseTimeToMinutes(
        TimezoneResolver.localTimeForInstant(
          TimezoneResolver.parseInstant(row.start_at),
          timezone,
        ),
      );
      const endMinutes = parseTimeToMinutes(
        TimezoneResolver.localTimeForInstant(
          TimezoneResolver.parseInstant(row.end_at),
          timezone,
        ),
      );
      const durationMinutes = Math.max(1, endMinutes - startMinutes);

      const bookings = result.get(row.resource_id) ?? [];
      bookings.push({
        id: row.id,
        startMinutes,
        durationMinutes,
        status: row.status === "pending" ? "Pending" : "Confirmed",
      });
      result.set(row.resource_id, bookings);
    }

    for (const [resourceId, bookings] of result) {
      bookings.sort((a, b) => a.startMinutes - b.startMinutes);
      result.set(resourceId, bookings);
    }

    return result;
  }

  static dayQueryBounds(date: string): { startIso: string; endIso: string } {
    const anchor = Date.parse(`${date}T12:00:00.000Z`);
    const start = new Date(anchor - 36 * 60 * 60 * 1000);
    const end = new Date(anchor + 36 * 60 * 60 * 1000);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  }
}
