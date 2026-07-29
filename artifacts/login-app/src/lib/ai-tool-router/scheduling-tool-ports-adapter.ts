import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSchedulingEnginePortFromAdapters,
  createSchedulingToolPorts,
  type SchedulingToolPorts,
} from "@workspace/ai-tool-router";
import { BookingFactory } from "@/lib/scheduling/booking-domain/booking-factory";

export function createLoginAppSchedulingToolPorts(client: SupabaseClient): SchedulingToolPorts {
  const services = BookingFactory.create(client);
  const engines = createSchedulingEnginePortFromAdapters({
    slotGenerationEngine: services.slotGenerationEngine,
    availabilityEngine: services.availabilityEngine,
  });
  return createSchedulingToolPorts(client, engines, services.bookingDomain);
}
