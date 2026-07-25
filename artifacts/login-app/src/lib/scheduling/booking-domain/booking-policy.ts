import type { BookingValidationErrorCode } from "@/lib/scheduling/booking-domain/types";
import { minutesUntilAppointment } from "@/lib/scheduling/booking-domain/booking-time-utils";

/** Pure booking-rule enforcement for cancellation and rescheduling windows. */
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
