import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingRepository } from "@/lib/scheduling/booking-domain/booking-repository";
import type { ExistingBooking } from "@/lib/scheduling/slot-generation-engine/types";

/**
 * Slot-engine adapter for loading existing bookings.
 * Delegates to BookingRepository (scheduling_bookings) — S4.5.
 */
export class SchedulingBookingRepository {
  private readonly bookingRepo: BookingRepository;

  constructor(client: SupabaseClient) {
    this.bookingRepo = new BookingRepository(client);
  }

  async listByResourceAndDate(
    companyId: string,
    resourceId: string,
    date: string,
    timezone: string,
  ): Promise<ExistingBooking[]> {
    return this.bookingRepo.listByResourceAndDate(companyId, resourceId, date, timezone);
  }

  async listByResourcesAndDate(
    companyId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
  ): Promise<Map<string, ExistingBooking[]>> {
    return this.bookingRepo.listByResourcesAndDate(companyId, resourceIds, date, timezone);
  }

  static dayQueryBounds = BookingRepository.dayQueryBounds;
}
