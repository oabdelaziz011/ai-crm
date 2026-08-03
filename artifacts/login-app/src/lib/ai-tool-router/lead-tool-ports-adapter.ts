import type { SupabaseClient } from "@supabase/supabase-js";
import { createLeadAgentToolPortsFromPlatform } from "@workspace/ai-tool-router";
import { getLoginAppLeadPlatformServices } from "@/lib/lead-platform/lead-read-port-adapter.js";

export function createLoginAppLeadToolPorts(client: SupabaseClient) {
  return createLeadAgentToolPortsFromPlatform(getLoginAppLeadPlatformServices(client));
}
