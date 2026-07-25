import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingLookupField } from "../lookup/booking-types.js";
import type { BookingRecord, CreateBookingResult } from "../types/create-booking-input.js";
import type { BookingRepositoryPort } from "../booking-repository-port.js";

const BOOKING_SELECT = "id, user_id, customer_id, service, doctor_id, location_id, booking_date, duration_minutes, notes, status";

export class SupabaseBookingRepository implements BookingRepositoryPort {
  constructor(private readonly client: SupabaseClient) {}

  async findConflictingBooking(input: {
    userId: string;
    doctorId: string;
    bookingDate: string;
    excludeBookingId?: string;
  }): Promise<BookingRecord | null> {
    let query = this.client
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", input.userId)
      .eq("doctor_id", input.doctorId)
      .eq("booking_date", input.bookingDate)
      .neq("status", "Cancelled")
      .limit(1);

    if (input.excludeBookingId) {
      query = query.neq("id", input.excludeBookingId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapBookingRecord(data);
  }

  async createBooking(input: {
    userId: string;
    customerId: string;
    service: string;
    doctorId: string;
    locationId: string;
    bookingDate: string;
    durationMinutes: number | null;
    notes: string | null;
  }): Promise<CreateBookingResult> {
    const { data, error } = await this.client
      .from("bookings")
      .insert({
        user_id: input.userId,
        customer_id: input.customerId,
        service: input.service,
        doctor_id: input.doctorId,
        location_id: input.locationId,
        booking_date: input.bookingDate,
        duration_minutes: input.durationMinutes,
        notes: input.notes,
        status: "Pending",
      })
      .select("id, booking_date")
      .single();

    if (error) throw new Error(error.message);

    return {
      bookingId: String(data.id),
      bookingDate: String(data.booking_date),
    };
  }

  async findBookingsByField(input: {
    userId: string;
    lookupBy: BookingLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: BookingRecord | null }> {
    const normalizedValue = input.lookupValue.trim();
    if (!normalizedValue) return { count: 0, record: null };

    if (input.lookupBy === "phone") {
      return this.findBookingsByCustomerPhone(input.userId, normalizedValue);
    }

    let query = this.client.from("bookings").select(BOOKING_SELECT, { count: "exact" }).eq("user_id", input.userId);

    if (input.lookupBy === "booking_id") {
      query = query.eq("id", normalizedValue);
    } else if (input.lookupBy === "customer_id") {
      query = query.eq("customer_id", normalizedValue);
    } else if (input.lookupBy === "date") {
      query = query.eq("booking_date", normalizedValue);
    }

    const { count, error: countError } = await query;
    if (countError) throw new Error(countError.message);

    const matchCount = count ?? 0;
    if (matchCount === 0) return { count: 0, record: null };
    if (matchCount > 1) return { count: matchCount, record: null };

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { count: 0, record: null };
    return { count: 1, record: mapBookingRecord(data) };
  }

  async updateBooking(input: {
    userId: string;
    bookingId: string;
    field: string;
    value: string;
  }): Promise<BookingRecord> {
    const column = mapUpdateColumn(input.field);
    const value = normalizeUpdateValue(column, input.value);

    const { data, error } = await this.client
      .from("bookings")
      .update({ [column]: value, updated_at: new Date().toISOString() })
      .eq("id", input.bookingId)
      .eq("user_id", input.userId)
      .select(BOOKING_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return mapBookingRecord(data);
  }

  async cancelBooking(input: { userId: string; bookingId: string }): Promise<BookingRecord> {
    const { data, error } = await this.client
      .from("bookings")
      .update({ status: "Cancelled", updated_at: new Date().toISOString() })
      .eq("id", input.bookingId)
      .eq("user_id", input.userId)
      .select(BOOKING_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return mapBookingRecord(data);
  }

  private async findBookingsByCustomerPhone(
    userId: string,
    phone: string,
  ): Promise<{ count: number; record: BookingRecord | null }> {
    const { data: customers, error: customerError } = await this.client
      .from("customers")
      .select("id")
      .eq("phone", phone);

    if (customerError) throw new Error(customerError.message);
    const customerIds = (customers ?? []).map((row) => String(row.id));
    if (customerIds.length === 0) return { count: 0, record: null };

    const { count, error: countError } = await this.client
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("customer_id", customerIds);

    if (countError) throw new Error(countError.message);
    const matchCount = count ?? 0;
    if (matchCount === 0) return { count: 0, record: null };
    if (matchCount > 1) return { count: matchCount, record: null };

    const { data, error } = await this.client
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("user_id", userId)
      .in("customer_id", customerIds)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { count: 0, record: null };
    return { count: 1, record: mapBookingRecord(data) };
  }
}

function mapBookingRecord(row: Record<string, unknown>): BookingRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    customerId: row.customer_id == null ? null : String(row.customer_id),
    service: String(row.service),
    doctorId: row.doctor_id == null ? null : String(row.doctor_id),
    locationId: row.location_id == null ? null : String(row.location_id),
    bookingDate: String(row.booking_date),
    durationMinutes:
      row.duration_minutes == null || row.duration_minutes === undefined
        ? null
        : Number(row.duration_minutes),
    notes: row.notes == null ? null : String(row.notes),
    status: String(row.status),
  };
}

function mapUpdateColumn(field: string): string {
  const normalized = field.trim();
  const aliases: Record<string, string> = {
    booking_id: "id",
    id: "id",
    service: "service",
    doctor: "doctor_id",
    doctor_id: "doctor_id",
    location: "location_id",
    location_id: "location_id",
    booking_date: "booking_date",
    date: "booking_date",
    duration: "duration_minutes",
    duration_minutes: "duration_minutes",
    notes: "notes",
    status: "status",
    customer: "customer_id",
    customer_id: "customer_id",
  };
  const column = aliases[normalized];
  if (!column) throw new Error(`Update booking field "${field}" is not supported.`);
  return column;
}

function normalizeUpdateValue(column: string, value: string): string | number | null {
  if (column === "duration_minutes") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("Update booking duration must be a positive number of minutes.");
    }
    return Math.round(parsed);
  }
  return value;
}
