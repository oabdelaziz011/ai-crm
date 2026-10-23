import type { SupabaseClient } from "@supabase/supabase-js";
import { TimezoneResolver } from "@/lib/scheduling/availability-engine/timezone-resolver";
import type { ExistingBooking } from "@/lib/scheduling/slot-generation-engine/types";
import {
  bookingConflictWindow,
  localDayLengthMinutes,
  localMidnight,
} from "@/lib/scheduling/booking-domain/booking-time-utils";
import {
  ACTIVE_BOOKING_STATUSES,
  type SchedulingBooking,
  type SchedulingBookingInsert,
  type SchedulingBookingStatus,
} from "@/lib/scheduling/booking-domain/types";

export type BookingDayWindow = {
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
};

function resourceSlotCapacity(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 1;
  const raw = (metadata as { capacity?: unknown }).capacity;
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function nonNegativeMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

/**
 * Widen the candidate bounds so existing rows are expanded in place.
 * buffer_before moves an existing start earlier; buffer_after moves an existing end later.
 * The candidate itself is not expanded, so adjacent bookings keep a single gap.
 */
function addMinutesIso(iso: string, minutes: number): string {
  if (minutes === 0) return iso;
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function bufferedOverlapBounds(
  startAt: string,
  endAt: string,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
): { startAt: string; endAt: string } {
  return {
    startAt:
      bufferAfterMinutes === 0
        ? startAt
        : new Date(Date.parse(startAt) - bufferAfterMinutes * 60_000).toISOString(),
    endAt:
      bufferBeforeMinutes === 0
        ? endAt
        : new Date(Date.parse(endAt) + bufferBeforeMinutes * 60_000).toISOString(),
  };
}

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
    exceptionLink?: {
      businessExceptionId?: string | null;
      businessExceptionItemId?: string | null;
    } | null,
  ): Promise<SchedulingBooking> {
    const payload: Record<string, unknown> = {
      status,
      updated_by: updatedBy,
    };
    if (notes !== undefined) {
      payload.notes = notes;
    }
    if (exceptionLink?.businessExceptionId) {
      payload.business_exception_id = exceptionLink.businessExceptionId;
    }
    if (exceptionLink?.businessExceptionItemId) {
      payload.business_exception_item_id = exceptionLink.businessExceptionItemId;
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
    const rules = await this.client
      .from("scheduling_booking_rules")
      .select("allow_overbooking, buffer_before_minutes, buffer_after_minutes")
      .eq("company_id", companyId)
      .maybeSingle();
    if (rules.error) throw new Error(rules.error.message);
    if (rules.data?.allow_overbooking) return null;

    const bufferBefore = nonNegativeMinutes(rules.data?.buffer_before_minutes);
    const bufferAfter = nonNegativeMinutes(rules.data?.buffer_after_minutes);
    let query = this.client
      .from("scheduling_bookings")
      .select("*", { count: "exact" })
      .eq("company_id", companyId)
      .eq("resource_id", resourceId)
      .is("deleted_at", null)
      .in("status", ACTIVE_BOOKING_STATUSES);
    if (bufferBefore === bufferAfter) {
      const overlap = bufferedOverlapBounds(startAt, endAt, bufferBefore, bufferAfter);
      query = query.lt("start_at", overlap.endAt).gt("end_at", overlap.startAt);
    } else {
      const endPlusBefore = addMinutesIso(endAt, bufferBefore);
      const startMinusAfter = addMinutesIso(startAt, -bufferAfter);
      const endPlusAfter = addMinutesIso(endAt, bufferAfter);
      const startMinusBefore = addMinutesIso(startAt, -bufferBefore);
      query = query.or(
        `and(start_at.lt."${endPlusBefore}",end_at.gt."${startMinusAfter}"),and(start_at.lt."${endPlusAfter}",end_at.gt."${startMinusBefore}")`,
      );
    }

    if (excludeBookingId) {
      query = query.neq("id", excludeBookingId);
    }

    const resource = await this.client
      .from("scheduling_resources")
      .select("metadata")
      .eq("id", resourceId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (resource.error) throw new Error(resource.error.message);
    const capacity = resourceSlotCapacity(resource.data?.metadata);

    const { data, error, count } = await query.limit(1);
    if (error) throw new Error(error.message);
    if ((count ?? 0) < capacity) return null;
    return (data?.[0] as SchedulingBooking | undefined) ?? null;
  }

  async listByResourceAndDate(
    companyId: string,
    resourceId: string,
    date: string,
    timezone: string,
    window?: BookingDayWindow,
  ): Promise<ExistingBooking[]> {
    const rows = await this.listByResourcesAndDate(companyId, [resourceId], date, timezone, window);
    return rows.get(resourceId) ?? [];
  }

  async listByResourcesAndDate(
    companyId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
    window?: BookingDayWindow,
  ): Promise<Map<string, ExistingBooking[]>> {
    const result = new Map<string, ExistingBooking[]>();
    for (const id of resourceIds) {
      result.set(id, []);
    }

    if (resourceIds.length === 0) {
      return result;
    }

    const bufferBefore = nonNegativeMinutes(window?.bufferBeforeMinutes);
    const bufferAfter = nonNegativeMinutes(window?.bufferAfterMinutes);
    const padMinutes = Math.max(bufferBefore, bufferAfter);
    const { startIso, endIso } = bookingConflictWindow(date, timezone, padMinutes);

    const { data, error } = await this.client
      .from("scheduling_bookings")
      .select("id, resource_id, start_at, end_at, status, timezone")
      .eq("company_id", companyId)
      .in("resource_id", resourceIds)
      .is("deleted_at", null)
      .in("status", ACTIVE_BOOKING_STATUSES)
      .lt("start_at", endIso)
      .gt("end_at", startIso);

    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const placed = bookingMinutesOnDate(row.start_at, row.end_at, timezone, date, padMinutes);
      if (!placed) continue;
      const { startMinutes, durationMinutes } = placed;

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

/** Place a booking in absolute minutes from local midnight. A negative start is the previous day. */
export function bookingMinutesOnDate(
  startAt: string,
  endAt: string,
  timezone: string,
  date: string,
  padMinutes: number,
): { startMinutes: number; durationMinutes: number } | null {
  const midnight = localMidnight(date, timezone).getTime();
  const startMinutes = Math.round((TimezoneResolver.parseInstant(startAt).getTime() - midnight) / 60_000);
  const endMinutes = Math.round((TimezoneResolver.parseInstant(endAt).getTime() - midnight) / 60_000);
  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes <= 0) return null;
  const dayLength = localDayLengthMinutes(date, timezone);
  if (startMinutes >= dayLength + padMinutes || endMinutes <= -padMinutes) return null;
  return { startMinutes, durationMinutes };
}
