/**
 * Shared native principal lookup. The company comes from X-ValueOR-Instance
 * and the same membership rules as GET /api/mobile/session.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { loadPlatformEnv } from "../config/env.js";
import { HttpError } from "../middleware/error-handler.js";
import {
  decideMobileAccess,
  displayNameFromAuthPayload,
  instanceSubdomain,
  permissionCodesFromAuthPayload,
  readInstanceHostname,
  type MobileCompanyRecord,
} from "./mobile-access.js";

export type MobilePrincipal =
  | { ok: false; status: number; code: string; message: string }
  | {
      ok: true;
      userId: string;
      scope: "platform" | "tenant";
      isSuperAdmin: boolean;
      company: { id: string; name: string | null; subdomain: string | null; status: string | null } | null;
      permissions: string[];
      displayName: string | null;
      userClient: SupabaseClient;
    };

function serviceClient() {
  const env = loadPlatformEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(token: string) {
  const env = loadPlatformEnv();
  const key =
    process.env.SUPABASE_ANON_KEY?.trim()
    || process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!env.supabaseUrl || !key) {
    throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");
  }
  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function resolveMobilePrincipal(input: {
  userId: string | null;
  token: string | null;
  profileCompanyId: string | null;
  isSuperAdmin: boolean;
  instanceHeader: string | undefined;
}): Promise<MobilePrincipal> {
  if (!input.userId || !input.token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }
  const hostname = readInstanceHostname(input.instanceHeader);
  const subdomain = instanceSubdomain(hostname);
  const service = serviceClient();
  let company: MobileCompanyRecord | null = null;
  if (subdomain) {
    const { data, error } = await service
      .from("companies")
      .select("id, name, status, approval_status, subdomain")
      .eq("subdomain", subdomain)
      .maybeSingle();
    if (error) throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");
    if (data) {
      company = {
        id: String(data.id),
        name: typeof data.name === "string" ? data.name : null,
        status: typeof data.status === "string" ? data.status : null,
        approvalStatus: typeof data.approval_status === "string" ? data.approval_status : null,
        subdomain: typeof data.subdomain === "string" ? data.subdomain : subdomain,
      };
    }
  }

  let hasLiveAdminContext = false;
  if (input.isSuperAdmin && company) {
    const { data, error } = await service
      .from("platform_admin_contexts")
      .select("id")
      .eq("actor_id", input.userId)
      .eq("company_id", company.id)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");
    hasLiveAdminContext = Boolean(data?.id);
  }

  const decision = decideMobileAccess({
    hostname,
    company,
    profileCompanyId: input.profileCompanyId,
    isSuperAdmin: input.isSuperAdmin,
    hasLiveAdminContext,
  });
  if (!decision.ok) return decision;

  const client = userClient(input.token);
  const { data: authPayload, error: authError } = await client.rpc("load_user_auth_context", {
    p_user_id: input.userId,
  });
  if (authError) throw new HttpError(503, "Authentication service unavailable.", "auth_unavailable");

  return {
    ok: true,
    userId: input.userId,
    scope: decision.scope,
    isSuperAdmin: decision.isSuperAdmin,
    company: decision.company
      ? {
          id: decision.company.id,
          name: decision.company.name,
          subdomain: decision.company.subdomain,
          status: decision.company.status,
        }
      : null,
    permissions: permissionCodesFromAuthPayload(authPayload),
    displayName: displayNameFromAuthPayload(authPayload),
    userClient: client,
  };
}
