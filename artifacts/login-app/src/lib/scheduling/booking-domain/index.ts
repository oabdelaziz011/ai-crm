export type {
  SchedulingBooking,
  SchedulingBookingInsert,
  SchedulingBookingStatus,
  SchedulingBookingSource,
  CreateBookingInput,
  RescheduleBookingInput,
  BookingMutationContext,
  BookingValidationResult,
  BookingValidationErrorCode,
  CreateBookingResult,
  CancelBookingResult,
  CompleteBookingResult,
  RescheduleBookingResult,
} from "@/lib/scheduling/booking-domain/types";

export {
  SCHEDULING_BOOKING_STATUSES,
  SCHEDULING_BOOKING_SOURCES,
  ACTIVE_BOOKING_STATUSES,
} from "@/lib/scheduling/booking-domain/types";

export type {
  BookingDomainEvent,
  BookingCreatedEvent,
  BookingCancelledEvent,
  BookingCompletedEvent,
  BookingRescheduledEvent,
  BookingEventPublisher,
} from "@/lib/scheduling/booking-domain/events";

export {
  NoOpBookingEventPublisher,
  BookingEventCollector,
  createBookingCreatedEvent,
  createBookingCancelledEvent,
  createBookingCompletedEvent,
  createBookingRescheduledEvent,
} from "@/lib/scheduling/booking-domain/events";

export { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
export { BookingValidationService } from "@/lib/scheduling/booking-domain/booking-validation-service";
export {
  evaluateCancellationPolicy,
  evaluateReschedulePolicy,
} from "@/lib/scheduling/booking-domain/booking-policy";
export {
  BOOKING_VALIDATION_ERROR_KEYS,
  formatBookingValidationErrors,
} from "@/lib/scheduling/booking-domain/booking-domain-errors";
export { BookingLifecycleService } from "@/lib/scheduling/booking-domain/booking-lifecycle-service";
export {
  BookingDomainService,
  BookingDomainError,
} from "@/lib/scheduling/booking-domain/booking-domain-service";
export {
  BookingFactory,
  getBookingDomainServices,
  type BookingDomainServices,
} from "@/lib/scheduling/booking-domain/booking-factory";

export {
  localDateTimeToInstant,
  localDateTimeToInstantIso,
  addMinutesToInstantIso,
  minutesUntilAppointment,
  instantOverlaps,
} from "@/lib/scheduling/booking-domain/booking-time-utils";
