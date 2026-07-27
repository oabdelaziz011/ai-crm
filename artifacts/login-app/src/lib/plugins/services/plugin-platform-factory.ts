import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PluginPlatformService } from "@/lib/plugins/services/plugin-platform-service";

let cached: PluginPlatformService | null = null;

export function createPluginPlatformServices(client: SupabaseClient = supabase): PluginPlatformService {
  return new PluginPlatformService(client);
}

export function getPluginPlatformServices(): PluginPlatformService {
  if (!cached) cached = createPluginPlatformServices();
  return cached;
}
