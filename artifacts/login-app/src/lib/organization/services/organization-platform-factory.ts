import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { OrganizationPlatformService } from "@/lib/organization/services/organization-platform-service";

let cached: OrganizationPlatformService | null = null;

export function createOrganizationPlatformServices(client: SupabaseClient = supabase): OrganizationPlatformService {
  return new OrganizationPlatformService(client);
}

export function getOrganizationPlatformServices(): OrganizationPlatformService {
  if (!cached) cached = createOrganizationPlatformServices();
  return cached;
}
