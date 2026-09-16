import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingLookupField } from "@workspace/automation-platform";
import type { BookingRecord } from "@workspace/automation-platform";
import {
  ACTIVE_BOOKING_STATUSES,
  type SchedulingBooking,
} from "@/lib/scheduling/booking-domain/types";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function phoneDigits(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export function phonesLikelyMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const tail = (value: string) => (value.length > 9 ? value.slice(-10) : value);
  return tail(a) === tail(b);
}

export function mapSchedulingBookingToRecord(
  booking: SchedulingBooking,
  userId?: string | null,
): BookingRecord {
  const start = Date.parse(booking.start_at);
  const end = Date.parse(booking.end_at);
  const durationMinutes =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / 60_000)
      : null;

  return {
    id: booking.id,
    userId: booking.created_by ?? userId ?? "",
    customerId: booking.customer_id,
    service: booking.service_id,
    doctorId: booking.resource_id,
    locationId: booking.branch_id,
    bookingDate: booking.start_at,
    durationMinutes,
    notes: booking.notes,
    status: booking.status,
  };
}

export async function findCustomerIdsByPhone(
  client: SupabaseClient,
  companyId: string,
  phone: string,
): Promise<string[]> {
  const trimmed = phone.trim();
  const digits = phoneDigits(trimmed);
  if (!trimmed && !digits) return [];

  const { data, error } = await client
    .from("customers")
    .select("id, phone, phone_e164")
    .eq("company_id", companyId);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .filter((row) => {
      const id = typeof row.id === "string" ? row.id.trim() : "";
      if (!id) return false;
      return (
        phonesLikelyMatch(row.phone, trimmed) ||
        phonesLikelyMatch(row.phone_e164, trimmed) ||
        phonesLikelyMatch(row.phone, digits) ||
        phonesLikelyMatch(row.phone_e164, digits)
      );
    })
    .map((row) => String(row.id));
}

export async function findSchedulingBookingsForLookup(input: {
  client: SupabaseClient;
  companyId: string;
  lookupBy: BookingLookupField;
  lookupValue: string;
  userId?: string | null;
}): Promise<BookingRecord[]> {
  const companyId = input.companyId.trim();
  const lookupValue = input.lookupValue.trim();
  if (!companyId || !lookupValue) return [];

  const repo = new BookingRepository(input.client);

  if (input.lookupBy === "booking_id") {
    if (!UUID_PATTERN.test(lookupValue)) return [];
    const booking = await repo.getById(lookupValue, companyId);
    if (!booking || booking.deleted_at) return [];
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) return [];
    return [mapSchedulingBookingToRecord(booking, input.userId)];
  }

  let customerIds: string[] = [];
  if (input.lookupBy === "customer_id") {
    if (!UUID_PATTERN.test(lookupValue)) return [];
    customerIds = [lookupValue];
  } else if (input.lookupBy === "phone") {
    customerIds = await findCustomerIdsByPhone(input.client, companyId, lookupValue);
  } else {
    return [];
  }

  const bookings = await repo.listUpcomingByCustomerIds(companyId, customerIds);
  return bookings.map((booking) => mapSchedulingBookingToRecord(booking, input.userId));
}
