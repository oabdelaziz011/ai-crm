import { ValidationError } from "../errors.js";
import type { BookingRepositoryPort } from "./booking-repository-port.js";
import type { CreateBookingInput, CreateBookingResult } from "./types/create-booking-input.js";

function readRequiredString(value: unknown, label: string): string {
  const normalized = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!normalized) throw new ValidationError(`Create booking requires ${label}.`);
  return normalized;
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

  async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
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
      userId,
      doctorId,
      bookingDate,
    });
    if (conflict) {
      throw new ValidationError("Selected appointment slot is no longer available.");
    }

    return this.repository.createBooking({
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
}
