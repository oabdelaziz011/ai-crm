import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCustomerServicePort as createPort } from "@workspace/automation-platform";

export { SupabaseCustomerRepository } from "@workspace/automation-platform";

export function createSupabaseCustomerServicePort(
  client: SupabaseClient,
  getActorUserId: () => string | null,
) {
  return createPort(client, { getActorUserId });
}
