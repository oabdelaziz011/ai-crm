import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BookingRepositoryPort,
  BookingRecord,
  CreateBookingResult,
} from "@workspace/automation-platform";

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
      .select("*")
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
