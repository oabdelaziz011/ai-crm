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
  const ports = createSchedulingToolPorts(client, engines, bookingDomain);
  return {
    ...ports,
    async createBooking(input) {
      const result = await ports.createBooking({
        ...input,
        source: input.source ?? "whatsapp",
      });
      if (result.success && input.conversationId && input.customerId) {
        await client
          .from("conversations")
          .update({ customer_id: input.customerId })
          .eq("id", input.conversationId)
          .eq("company_id", input.companyId)
          .is("customer_id", null);
      }
      return result;
    },
  };
}
