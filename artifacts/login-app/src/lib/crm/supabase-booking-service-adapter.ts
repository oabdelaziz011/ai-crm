import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DefaultBookingServicePort,
  type BookingServicePort,
  type CreateBookingInput,
  type CreateBookingResult,
} from "@workspace/automation-platform";
import { SupabaseBookingRepository } from "./supabase-booking-repository";

export function createSupabaseBookingServicePort(
  client: SupabaseClient,
  getActorUserId: () => string | null,
): BookingServicePort {
  const repository = new SupabaseBookingRepository(client);
  const delegate = new DefaultBookingServicePort(repository);

  return {
    async createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
      const userId = input.userId || getActorUserId();
      if (!userId) {
        throw new Error("Create booking requires an authenticated owner user.");
      }
      return delegate.createBooking({ ...input, userId });
    },
  };
}
