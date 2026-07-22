import type { BookingRecord, CreateBookingInput, CreateBookingResult } from "./types/create-booking-input.js";

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
}
