import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppointmentPlatformServices,
  AppointmentReadAccessContext,
  AppointmentReadPort,
  AppointmentServiceContext,
} from "@workspace/appointment-platform";
import { APPOINTMENT_PERMISSIONS } from "@workspace/appointment-platform";
import { supabase } from "@/lib/supabase";
import { createLoginAppAppointmentPlatformServices } from "./appointment-platform-factory.js";

let cachedPlatform: AppointmentPlatformServices | null = null;

export function createLoginAppAppointmentReadPort(client: SupabaseClient = supabase): AppointmentReadPort {
  return getLoginAppAppointmentPlatformServices(client).reads;
}

export function getLoginAppAppointmentPlatformServices(client: SupabaseClient = supabase): AppointmentPlatformServices {
  if (!cachedPlatform) {
    cachedPlatform = createLoginAppAppointmentPlatformServices(client);
  }
  return cachedPlatform;
}

export function buildAppointmentServiceContext(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): AppointmentServiceContext {
  return {
    userId: input.actorUserId ?? null,
    companyId: input.companyId,
    isSuperAdmin: Boolean(input.isSuperAdmin),
    hasPermission: input.hasPermission,
  };
}

export function buildAppointmentReadAccess(input: {
  companyId: string;
  actorUserId?: string | null;
  isSuperAdmin?: boolean;
  hasPermission: (code: string) => boolean;
}): AppointmentReadAccessContext {
  return buildAppointmentServiceContext(input);
}

export function buildDashboardAppointmentReadAccess(companyId: string): AppointmentReadAccessContext {
  return {
    userId: null,
    companyId,
    isSuperAdmin: false,
    hasPermission: (code) => code === APPOINTMENT_PERMISSIONS.view,
  };
}

export function resetLoginAppAppointmentPlatformForTests(): void {
  cachedPlatform = null;
}
