import type { SupabaseClient } from "@supabase/supabase-js";
import { AvailabilityEngine } from "./availability-engine/availability-engine.js";
import { SlotGenerationEngine } from "./slot-generation-engine/slot-generation-engine.js";
import { BookingDomainService } from "./booking-domain/booking-domain-service.js";
import { SupabaseBookingNotificationPublisher } from "./booking-domain/supabase-booking-notification-publisher.js";

export { AvailabilityEngine, SlotGenerationEngine };
export { TimezoneResolver } from "./availability-engine/timezone-resolver.js";
export {
  AVAILABLE_DATES_EMPTY_MESSAGE,
  AVAILABLE_DATES_WINDOW_DAYS,
  DEFAULT_DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  MIN_DAYS_AHEAD,
  InvalidDaysAheadError,
  addDaysIso,
  buildDateScanRange,
  buildEmptyAvailabilityResult,
  filterAvailableDates,
  formatEmptyAvailabilityMessage,
  normalizeDaysAhead,
  suggestNextWindow,
} from "./availability-engine/scan-available-dates.js";
export {
  getNextAvailableSlot,
  scanAvailableDates,
  type AvailabilityResourceInput,
  type AvailabilityScanEnginePort,
  type GetNextAvailableSlotInput,
  type NextAvailableSlot,
  type ScanAvailableDatesInput,
  type ScanAvailableDatesResult,
} from "./availability-engine/availability-scanner.js";
export {
  RecommendationEngine,
  recommendAppointments,
  RECOMMENDATION_SCORE_WEIGHTS,
  type AlternativeBranchRecommendation,
  type AlternativeResourceRecommendation,
  type AppointmentRecommendation,
  type NearestDateRecommendation,
  type RecommendAppointmentsInput,
  type RecommendAppointmentsResult,
  type RecommendationBranchContext,
  type RecommendationPreferences,
  type RecommendationResourceContext,
  type RecommendationScoreFactors,
} from "./recommendation-engine/index.js";
export { BookingDomainService, BookingDomainError } from "./booking-domain/booking-domain-service.js";
export type {
  CreateBookingInput,
  CreateBookingResult,
  SchedulingBooking,
  SchedulingBookingSource,
  SchedulingBookingStatus,
  CancelBookingInput,
  CancelBookingResult,
  RescheduleBookingInput,
  RescheduleBookingResult,
  BookingMutationContext,
  CheckInBookingResult,
  MarkNoShowBookingResult,
  CompleteBookingResult,
  BookingValidationResult,
} from "./booking-domain/types.js";
export {
  BookingEventCollector,
  NoOpBookingEventPublisher,
  type BookingDomainEvent,
  type BookingEventPublisher,
} from "./booking-domain/events.js";
export { SupabaseBookingNotificationPublisher } from "./booking-domain/supabase-booking-notification-publisher.js";

export function createSchedulingEngines(client: SupabaseClient) {
  return {
    availabilityEngine: new AvailabilityEngine(client),
    slotGenerationEngine: new SlotGenerationEngine(client),
  };
}

export function createBookingDomainStack(client: SupabaseClient) {
  const { availabilityEngine, slotGenerationEngine } = createSchedulingEngines(client);
  const eventPublisher = new SupabaseBookingNotificationPublisher(client);
  const bookingDomain = new BookingDomainService(client, slotGenerationEngine, eventPublisher);

  return {
    availabilityEngine,
    slotGenerationEngine,
    bookingDomain,
  };
}
