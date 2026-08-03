import type { SupabaseClient } from "@supabase/supabase-js";
import { createTicketAgentToolPortsFromPlatform } from "@workspace/ai-tool-router";
import { createLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-platform-factory";

export function createLoginAppTicketToolPorts(client: SupabaseClient) {
  const platform = createLoginAppTicketPlatformServices(client);
  return createTicketAgentToolPortsFromPlatform(platform);
}
