import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseBookingServicePort as createPort,
  type BookingServicePort,
} from "@workspace/automation-platform";

export function createSupabaseBookingServicePort(
  client: SupabaseClient,
  getActorUserId: () => string | null,
): BookingServicePort {
  return createPort(client, { getActorUserId });
}
