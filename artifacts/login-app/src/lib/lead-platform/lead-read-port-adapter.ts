import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadPlatformServices, LeadReadAccessContext, LeadReadPort, LeadServiceContext } from "@workspace/lead-platform";
import { LEAD_PERMISSIONS } from "@workspace/lead-platform";
import { supabase } from "@/lib/supabase";
import { createLoginAppLeadPlatformServices } from "./lead-platform-factory.js";

let cachedPlatform: LeadPlatformServices | null = null;

export function createLoginAppLeadReadPort(client: SupabaseClient = supabase): LeadReadPort {
  return getLoginAppLeadPlatformServices(client).reads;
}

export function getLoginAppLeadPlatformServices(client: SupabaseClient = supabase): LeadPlatformServices {
  if (!cachedPlatform) {
    cachedPlatform = createLoginAppLeadPlatformServices(client);
  }
  return cachedPlatform;
}

export function buildLeadServiceContext(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): LeadServiceContext {
  return {
    userId: input.actorUserId ?? null,
    companyId: input.companyId,
    isSuperAdmin: Boolean(input.isSuperAdmin),
    hasPermission: input.hasPermission,
  };
}

export function buildLeadReadAccess(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): LeadReadAccessContext {
  return buildLeadServiceContext(input);
}

export function buildDashboardLeadReadAccess(companyId: string): LeadReadAccessContext {
  return {
    userId: null,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) => code === LEAD_PERMISSIONS.view,
  };
}

export function resetLoginAppLeadPlatformForTests(): void {
  cachedPlatform = null;
}
