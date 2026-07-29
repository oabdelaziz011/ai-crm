import type { SupabaseClient } from "@supabase/supabase-js";
import { AvailabilityEngine } from "./availability-engine/availability-engine.js";
import { SlotGenerationEngine } from "./slot-generation-engine/slot-generation-engine.js";
import { BookingDomainService } from "./booking-domain/booking-domain-service.js";
import { SupabaseBookingNotificationPublisher } from "./booking-domain/supabase-booking-notification-publisher.js";

export { AvailabilityEngine, SlotGenerationEngine };
export { BookingDomainService, BookingDomainError } from "./booking-domain/booking-domain-service.js";
export type { CreateBookingInput, CreateBookingResult, SchedulingBooking } from "./booking-domain/types.js";
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
