import type { SupabaseClient } from "@supabase/supabase-js";
import { createHandoffAgentToolPortsFromPlatform } from "@workspace/ai-tool-router";
import { getLoginAppHandoffPlatformServices } from "@/lib/human-handoff-platform/handoff-read-port-adapter";

export function createLoginAppHandoffToolPorts(client: SupabaseClient) {
  const platform = getLoginAppHandoffPlatformServices(client);
  return createHandoffAgentToolPortsFromPlatform(platform, {
    userId: null,
    companyId: "",
    isSuperAdmin: false,
    hasPermission: () => true,
  });
}
