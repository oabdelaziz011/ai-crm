import type { BookingLookupField } from "./lookup/booking-types.js";
import type { BookingRecord, CreateBookingResult } from "./types/create-booking-input.js";

export interface BookingRepositoryPort {
  findConflictingBooking(input: {
    userId: string;
    doctorId: string;
    bookingDate: string;
    excludeBookingId?: string;
  }): Promise<BookingRecord | null>;

  createBooking(input: {
    userId: string;
    customerId: string;
    service: string;
    doctorId: string;
    locationId: string;
    bookingDate: string;
    durationMinutes: number | null;
    notes: string | null;
  }): Promise<CreateBookingResult>;

  findBookingsByField(input: {
    userId: string;
    lookupBy: BookingLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: BookingRecord | null }>;

  updateBooking(input: {
    userId: string;
    bookingId: string;
    field: string;
    value: string;
  }): Promise<BookingRecord>;

  cancelBooking(input: { userId: string; bookingId: string }): Promise<BookingRecord>;
}

export class InMemoryBookingRepository implements BookingRepositoryPort {
  private readonly bookings: BookingRecord[] = [];

  list(): BookingRecord[] {
    return [...this.bookings];
  }

  async findConflictingBooking(input: {
    userId: string;
    doctorId: string;
    bookingDate: string;
    excludeBookingId?: string;
  }): Promise<BookingRecord | null> {
    return (
      this.bookings.find(
        (booking) =>
          booking.userId === input.userId &&
          booking.doctorId === input.doctorId &&
          booking.bookingDate === input.bookingDate &&
          booking.status !== "Cancelled" &&
          booking.id !== input.excludeBookingId,
      ) ?? null
    );
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
    const id = `booking-${this.bookings.length + 1}`;
    const record: BookingRecord = {
      id,
      userId: input.userId,
      customerId: input.customerId,
      service: input.service,
      doctorId: input.doctorId,
      locationId: input.locationId,
      bookingDate: input.bookingDate,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      status: "Pending",
    };
    this.bookings.push(record);
    return { bookingId: id, bookingDate: input.bookingDate };
  }

  async findBookingsByField(input: {
    userId: string;
    lookupBy: BookingLookupField;
    lookupValue: string;
  }): Promise<{ count: number; record: BookingRecord | null }> {
    const normalized = input.lookupValue.trim();
    const matches = this.bookings.filter((booking) => {
      if (booking.userId !== input.userId) return false;
      if (input.lookupBy === "booking_id") return booking.id === normalized;
      if (input.lookupBy === "customer_id") return booking.customerId === normalized;
      if (input.lookupBy === "date") return booking.bookingDate === normalized;
      return false;
    });

    if (matches.length === 0) return { count: 0, record: null };
    if (matches.length > 1) return { count: matches.length, record: null };
    return { count: 1, record: matches[0] ?? null };
  }

  async updateBooking(input: {
    userId: string;
    bookingId: string;
    field: string;
    value: string;
  }): Promise<BookingRecord> {
    const booking = this.bookings.find((item) => item.id === input.bookingId && item.userId === input.userId);
    if (!booking) throw new Error("Booking not found.");

    const field = input.field.trim();
    if (field === "service") booking.service = input.value;
    else if (field === "status") booking.status = input.value;
    else if (field === "notes") booking.notes = input.value;
    else if (field === "doctor" || field === "doctor_id") booking.doctorId = input.value;
    else if (field === "location" || field === "location_id") booking.locationId = input.value;
    else if (field === "booking_date" || field === "date") booking.bookingDate = input.value;
    else if (field === "duration" || field === "duration_minutes") booking.durationMinutes = Number(input.value);
    else throw new Error(`Update booking field "${field}" is not supported.`);

    return { ...booking };
  }

  async cancelBooking(input: { userId: string; bookingId: string }): Promise<BookingRecord> {
    const booking = this.bookings.find((item) => item.id === input.bookingId && item.userId === input.userId);
    if (!booking) throw new Error("Booking not found.");
    booking.status = "Cancelled";
    return { ...booking };
  }
}
