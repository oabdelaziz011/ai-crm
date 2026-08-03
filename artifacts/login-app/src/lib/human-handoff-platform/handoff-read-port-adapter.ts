import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HandoffPlatformServices,
  HandoffReadAccessContext,
  HandoffReadPort,
  HandoffServiceContext,
} from "@workspace/human-handoff-platform";
import { supabase } from "@/lib/supabase";
import { createLoginAppHandoffPlatformServices } from "./handoff-platform-factory.js";

let cachedPlatform: HandoffPlatformServices | null = null;

export function createLoginAppHandoffReadPort(client: SupabaseClient = supabase): HandoffReadPort {
  return getLoginAppHandoffPlatformServices(client).reads;
}

export function getLoginAppHandoffPlatformServices(
  client: SupabaseClient = supabase,
): HandoffPlatformServices {
  if (!cachedPlatform) {
    cachedPlatform = createLoginAppHandoffPlatformServices(client);
  }
  return cachedPlatform;
}

export function buildHandoffServiceContext(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): HandoffServiceContext {
  return {
    userId: input.actorUserId ?? null,
    companyId: input.companyId,
    isSuperAdmin: Boolean(input.isSuperAdmin),
    hasPermission: input.hasPermission,
  };
}

export function buildHandoffReadAccess(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): HandoffReadAccessContext {
  return buildHandoffServiceContext(input);
}

export function resetLoginAppHandoffPlatformForTests(): void {
  cachedPlatform = null;
}
