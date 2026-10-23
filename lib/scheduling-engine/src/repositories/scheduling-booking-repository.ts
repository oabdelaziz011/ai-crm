import type { SupabaseClient } from "@supabase/supabase-js";
import { BookingRepository, type BookingDayWindow } from "../booking-domain/booking-repository";
import type { ExistingBooking } from "../slot-generation-engine/types";

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
    window?: BookingDayWindow,
  ): Promise<ExistingBooking[]> {
    return this.bookingRepo.listByResourceAndDate(companyId, resourceId, date, timezone, window);
  }

  async listByResourcesAndDate(
    companyId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
    window?: BookingDayWindow,
  ): Promise<Map<string, ExistingBooking[]>> {
    return this.bookingRepo.listByResourcesAndDate(companyId, resourceIds, date, timezone, window);
  }

  static dayQueryBounds = BookingRepository.dayQueryBounds;
}
