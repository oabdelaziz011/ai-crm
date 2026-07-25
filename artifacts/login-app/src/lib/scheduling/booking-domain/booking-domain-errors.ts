import type { BookingValidationErrorCode } from "@/lib/scheduling/booking-domain/types";

export const BOOKING_VALIDATION_ERROR_KEYS: Record<BookingValidationErrorCode, string> = {
  resource_not_found: "scheduling.bookingDomain.errors.resourceNotFound",
  resource_inactive: "scheduling.bookingDomain.errors.resourceInactive",
  service_not_found: "scheduling.bookingDomain.errors.serviceNotFound",
  service_inactive: "scheduling.bookingDomain.errors.serviceInactive",
  customer_not_found: "scheduling.bookingDomain.errors.customerNotFound",
  capability_missing: "scheduling.bookingDomain.errors.capabilityMissing",
  slot_unavailable: "scheduling.bookingDomain.errors.slotUnavailable",
  booking_conflict: "scheduling.bookingDomain.errors.bookingConflict",
  outside_booking_window: "scheduling.bookingDomain.errors.outsideBookingWindow",
  inside_minimum_notice: "scheduling.bookingDomain.errors.insideMinimumNotice",
  company_mismatch: "scheduling.bookingDomain.errors.companyMismatch",
  invalid_date: "scheduling.bookingDomain.errors.invalidDate",
  invalid_slot_time: "scheduling.bookingDomain.errors.invalidSlotTime",
  booking_not_found: "scheduling.bookingDomain.errors.bookingNotFound",
  invalid_status_transition: "scheduling.bookingDomain.errors.invalidStatusTransition",
  cancellation_window_expired: "scheduling.bookingDomain.errors.cancellationWindowExpired",
  reschedule_window_expired: "scheduling.bookingDomain.errors.rescheduleWindowExpired",
};

export function formatBookingValidationErrors(
  codes: BookingValidationErrorCode[],
  translate: (key: string) => string,
): string {
  return codes
    .map((code) => {
      const key = BOOKING_VALIDATION_ERROR_KEYS[code];
      return key ? translate(key) : code;
    })
    .join(", ");
}
