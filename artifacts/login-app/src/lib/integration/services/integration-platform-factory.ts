import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { IntegrationPlatformService } from "@/lib/integration/services/integration-platform-service";

let cached: IntegrationPlatformService | null = null;

export function createIntegrationPlatformServices(client: SupabaseClient = supabase): IntegrationPlatformService {
  return new IntegrationPlatformService(client);
}

export function getIntegrationPlatformServices(): IntegrationPlatformService {
  if (!cached) cached = createIntegrationPlatformServices();
  return cached;
}
