import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TICKET_PERMISSIONS,
  type TicketPlatformServices,
  type TicketReadAccessContext,
  type TicketReadPort,
} from "@workspace/ticket-platform";
import { supabase } from "@/lib/supabase";
import { createLoginAppTicketPlatformServices } from "@/lib/ticket-platform/ticket-platform-factory";

let cachedPlatform: TicketPlatformServices | null = null;

export function createLoginAppTicketReadPort(client: SupabaseClient = supabase): TicketReadPort {
  return getLoginAppTicketPlatformServices(client).reads;
}

export function getLoginAppTicketPlatformServices(
  client: SupabaseClient = supabase,
): TicketPlatformServices {
  if (!cachedPlatform) {
    cachedPlatform = createLoginAppTicketPlatformServices(client);
  }
  return cachedPlatform;
}

export function buildTicketReadAccess(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): TicketReadAccessContext {
  return {
    userId: input.actorUserId ?? null,
    companyId: input.companyId,
    isSuperAdmin: Boolean(input.isSuperAdmin),
    hasPermission: input.hasPermission,
  };
}

/** Dashboard provider gate already enforced; allow legacy conversation viewers. */
export function buildDashboardTicketReadAccess(companyId: string): TicketReadAccessContext {
  return {
    userId: null,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === TICKET_PERMISSIONS.view
        ? true
        : false,
  };
}

export function resetLoginAppTicketPlatformForTests(): void {
  cachedPlatform = null;
}
