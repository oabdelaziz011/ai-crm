import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseBookingServicePort as createPort,
  type BookingServicePort,
  type SupabaseBookingServicePortOptions,
} from "@workspace/automation-platform";

export function createSupabaseBookingServicePort(
  client: SupabaseClient,
  options: SupabaseBookingServicePortOptions | (() => string | null) = {},
): BookingServicePort {
  const portOptions =
    typeof options === "function" ? { getActorUserId: options } : options;
  return createPort(client, portOptions);
}
