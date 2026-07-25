/**
 * Calendar booking mutations delegate to BookingDomainService via existing hooks.
 * Sprint 5.1 does not add drag/resize mutation paths.
 */
export {
  useCancelDomainBooking,
  useCompleteDomainBooking,
  useCreateDomainBooking,
  useRescheduleDomainBooking,
  formatBookingDomainError,
} from "@/hooks/use-booking-domain";
