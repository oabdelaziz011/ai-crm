import type { SupabaseClient } from "@supabase/supabase-js";
import type { SchedulingQueryPort } from "@workspace/application-layer";
import {
  createSchedulingEnginePortFromAdapters,
  createSchedulingToolPorts,
} from "@workspace/ai-tool-router";
import { getLoginAppAppointmentPlatformServices } from "@/lib/appointment-platform/appointment-read-port-adapter";

/** Infrastructure adapter — scheduling engines sit behind Application Layer SchedulingQueryPort only. */
export function createLoginAppSchedulingQueryPort(client: SupabaseClient): SchedulingQueryPort {
  const platform = getLoginAppAppointmentPlatformServices(client);
  const engines = createSchedulingEnginePortFromAdapters({
    slotGenerationEngine: platform.scheduling.slotGenerationEngine,
    availabilityEngine: platform.scheduling.availabilityEngine,
  });
  const toolPorts = createSchedulingToolPorts(client, engines);

  return {
    searchAvailability(input) {
      return toolPorts.searchAvailability({
        companyId: input.tenantId,
        userId: input.actorUserId,
        serviceId: input.serviceId,
        resourceId: input.resourceId,
        branchId: input.branchId,
        date: input.date,
        daysAhead: input.daysAhead,
      });
    },
    findNextAvailable(input) {
      return toolPorts.findNextAvailable({
        companyId: input.tenantId,
        userId: input.actorUserId,
        serviceId: input.serviceId,
        resourceId: input.resourceId,
        branchId: input.branchId,
        daysAhead: input.daysAhead,
      });
    },
    recommendAppointment(input) {
      return toolPorts.recommendAppointment({
        companyId: input.tenantId,
        userId: input.actorUserId,
        serviceId: input.serviceId,
        preferredResourceId: input.preferredResourceId,
        preferredBranchId: input.preferredBranchId,
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime,
        daysAhead: input.daysAhead,
      });
    },
  };
}
