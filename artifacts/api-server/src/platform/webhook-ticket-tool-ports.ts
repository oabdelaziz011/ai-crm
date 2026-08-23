import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTicketAgentToolPortsFromPlatform,
  type TicketAgentToolPorts,
} from "@workspace/ai-tool-router";
import {
  createSupabaseTicketAuditPort,
  createTicketPlatformServices,
} from "@workspace/ticket-platform";

/** Webhook ticket ports must stay on the service-role client (no login-app browser bridges). */
export function createWebhookTicketToolPorts(client: SupabaseClient): TicketAgentToolPorts {
  const platform = createTicketPlatformServices(client, {
    audit: createSupabaseTicketAuditPort(client),
  });
  return createTicketAgentToolPortsFromPlatform(platform);
}
