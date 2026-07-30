import { ValidationError } from "../errors.js";
import { BOOKING_LOOKUP_FIELDS, type BookingLookupField } from "./lookup/booking-types.js";
import type { BookingRepositoryPort } from "./booking-repository-port.js";
import type { CreateBookingInput, CreateBookingResult } from "./types/create-booking-input.js";
import type { FindBookingInput, FindBookingResult } from "./types/find-booking-input.js";
import type { CancelBookingInput, CancelBookingResult, UpdateBookingInput, UpdateBookingResult } from "./types/booking-mutation-input.js";

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new ValidationError(`Booking action requires ${label}.`);
  return normalized;
}

function readLookupBy(value: unknown): BookingLookupField {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!BOOKING_LOOKUP_FIELDS.includes(normalized as BookingLookupField)) {
    throw new ValidationError("Find booking lookup field is invalid.");
  }
  return normalized as BookingLookupField;
}

function parseDurationMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ValidationError("Create booking duration must be a positive number of minutes.");
  }
  return Math.round(parsed);
}

function mergeAppointmentDateTime(datePart: string, timePart: string): string {
  const dateOnly = datePart.trim();
  const timeOnly = timePart.trim();
  const combined = timeOnly.includes("T") ? timeOnly : `${dateOnly}T${timeOnly}`;
  const parsed = new Date(combined);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Create booking appointment date/time is invalid.");
  }
  return parsed.toISOString();
}

export class BookingService {
  constructor(private readonly repository: BookingRepositoryPort) {}

  async findBooking(input: FindBookingInput): Promise<FindBookingResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    const lookupBy = readLookupBy(input.lookupBy);
    const lookupValue = readRequiredString(input.lookupValue, "lookup value");

    const { count, record } = await this.repository.findBookingsByField({
      companyId: input.companyId,
      userId: input.userId,
      lookupBy,
      lookupValue,
    });

    if (count === 0) return { status: "not_found", count: 0 };
    if (count === 1 && record) return { status: "found", count: 1, booking: record };
    return { status: "duplicate", count };
  }

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
    const companyId = readRequiredString(input.companyId, "company");
    const service = readRequiredString(input.service, "service");
    const doctorId = readRequiredString(input.doctorId, "doctor");
    const locationId = readRequiredString(input.locationId, "location");
    const appointmentDate = readRequiredString(input.appointmentDate, "appointment date");
    const appointmentTime = readRequiredString(input.appointmentTime, "appointment time");
    const customerId = readRequiredString(input.customerId, "customer");
    const userId = readRequiredString(input.userId, "owner");
    const durationMinutes = parseDurationMinutes(input.durationMinutes);
    const notes =
      input.notes == null || String(input.notes).trim() === "" ? null : String(input.notes).trim();

    const bookingDate = mergeAppointmentDateTime(appointmentDate, appointmentTime);

    const conflict = await this.repository.findConflictingBooking({
      companyId,
      userId,
      doctorId,
      bookingDate,
    });
    if (conflict) {
      throw new ValidationError("Selected appointment slot is no longer available.");
    }

    return this.repository.createBooking({
      companyId,
      userId,
      customerId,
      service,
      doctorId,
      locationId,
      bookingDate,
      durationMinutes,
      notes,
    });
  }

  async updateBooking(input: UpdateBookingInput): Promise<UpdateBookingResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    readRequiredString(input.bookingId, "booking id");
    readRequiredString(input.field, "field");
    readRequiredString(input.value, "value");

    const booking = await this.repository.updateBooking({
      userId: input.userId,
      bookingId: input.bookingId,
      field: input.field,
      value: input.value,
    });

    return { booking };
  }

  async cancelBooking(input: CancelBookingInput): Promise<CancelBookingResult> {
    readRequiredString(input.companyId, "company");
    readRequiredString(input.userId, "owner");
    readRequiredString(input.bookingId, "booking id");

    const booking = await this.repository.cancelBooking({
      userId: input.userId,
      bookingId: input.bookingId,
    });

    return { booking };
  }
}
