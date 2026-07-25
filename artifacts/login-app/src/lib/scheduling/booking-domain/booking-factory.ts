import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { AvailabilityEngine } from "@/lib/scheduling/availability-engine/availability-engine";
import { SlotGenerationEngine } from "@/lib/scheduling/slot-generation-engine/slot-generation-engine";
import { BookingDomainService } from "@/lib/scheduling/booking-domain/booking-domain-service";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import { BookingValidationService } from "@/lib/scheduling/booking-domain/booking-validation-service";
import type { BookingEventPublisher } from "@/lib/scheduling/booking-domain/events";
import { NoOpBookingEventPublisher } from "@/lib/scheduling/booking-domain/events";

export type BookingDomainServices = {
  bookingDomain: BookingDomainService;
  bookingRepository: BookingRepository;
  bookingValidation: BookingValidationService;
  availabilityEngine: AvailabilityEngine;
  slotGenerationEngine: SlotGenerationEngine;
};

export class BookingFactory {
  static create(
    client: SupabaseClient = supabase,
    eventPublisher: BookingEventPublisher = new NoOpBookingEventPublisher(),
  ): BookingDomainServices {
    const availabilityEngine = new AvailabilityEngine(client);
    const slotGenerationEngine = new SlotGenerationEngine(client);

    return {
      availabilityEngine,
      slotGenerationEngine,
      bookingRepository: new BookingRepository(client),
      bookingValidation: new BookingValidationService(client, slotGenerationEngine),
      bookingDomain: new BookingDomainService(client, slotGenerationEngine, eventPublisher),
    };
  }
}

let defaultBookingServices: BookingDomainServices | null = null;

export function getBookingDomainServices(): BookingDomainServices {
  if (!defaultBookingServices) {
    defaultBookingServices = BookingFactory.create();
  }
  return defaultBookingServices;
}
