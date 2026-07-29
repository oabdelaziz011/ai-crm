import type { BookingValidationErrorCode } from "./types.js";
import { minutesUntilAppointment } from "./booking-time-utils.js";

export function evaluateCancellationPolicy(
  appointmentStartAtIso: string,
  minCancellationNoticeMinutes: number,
  referenceNow: Date,
): BookingValidationErrorCode | null {
  const remainingMinutes = minutesUntilAppointment(appointmentStartAtIso, referenceNow);
  if (remainingMinutes < minCancellationNoticeMinutes) {
    return "cancellation_window_expired";
  }
  return null;
}

export function evaluateReschedulePolicy(
  appointmentStartAtIso: string,
  minRescheduleNoticeMinutes: number,
  referenceNow: Date,
): BookingValidationErrorCode | null {
  const remainingMinutes = minutesUntilAppointment(appointmentStartAtIso, referenceNow);
  if (remainingMinutes < minRescheduleNoticeMinutes) {
    return "reschedule_window_expired";
  }
  return null;
}
