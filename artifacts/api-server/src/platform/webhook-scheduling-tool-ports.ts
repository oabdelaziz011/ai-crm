import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSchedulingEnginePortFromAdapters,
  createSchedulingToolPorts,
  type SchedulingToolPorts,
} from "@workspace/ai-tool-router";
import { createBookingDomainStack } from "@workspace/scheduling-engine";

export function createWebhookSchedulingToolPorts(client: SupabaseClient): SchedulingToolPorts {
  const { availabilityEngine, slotGenerationEngine, bookingDomain } = createBookingDomainStack(client);
  const engines = createSchedulingEnginePortFromAdapters({
    slotGenerationEngine,
    availabilityEngine,
  });
  return createSchedulingToolPorts(client, engines, bookingDomain);
}
