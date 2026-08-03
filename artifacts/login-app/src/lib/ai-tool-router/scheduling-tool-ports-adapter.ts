import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSchedulingEnginePortFromAdapters,
  createSchedulingToolPorts,
  type SchedulingToolPorts,
} from "@workspace/ai-tool-router";
import { getLoginAppAppointmentPlatformServices } from "@/lib/appointment-platform/appointment-read-port-adapter";
import { createAppointmentBookingDomainAdapter } from "@/lib/appointment-platform/appointment-booking-domain-adapter";

export function createLoginAppSchedulingToolPorts(client: SupabaseClient): SchedulingToolPorts {
  const platform = getLoginAppAppointmentPlatformServices(client);
  const engines = createSchedulingEnginePortFromAdapters({
    slotGenerationEngine: platform.scheduling.slotGenerationEngine,
    availabilityEngine: platform.scheduling.availabilityEngine,
  });
  const bookingDomain = createAppointmentBookingDomainAdapter(platform.commands);
  return createSchedulingToolPorts(client, engines, bookingDomain);
}
