import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createTicketAgentToolPortsFromPlatform,
  type TicketAgentToolPorts,
} from "@workspace/ai-tool-router";
import { createLoginAppTicketPlatformServices } from "@login-app/lib/ticket-platform/ticket-platform-factory.js";

export function createWebhookTicketToolPorts(client: SupabaseClient): TicketAgentToolPorts {
  const platform = createLoginAppTicketPlatformServices(client);
  return createTicketAgentToolPortsFromPlatform(platform);
}
