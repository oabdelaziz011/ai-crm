import { supabase } from "@/lib/supabase";
import { normalizeAuthBootstrapProfile } from "@/lib/auth/normalize-auth-bootstrap-profile";
import { parseRpcPayloadForTest } from "@/lib/auth/parse-auth-rpc-payload";
import { omniCompanyTrace } from "@/lib/omnichannel/debug/omni-company-audit";

export interface AuthBootstrapProfile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  preferred_language: string | null;
  timezone: string | null;
  avatar_url: string | null;
}

export interface AuthBootstrapCompany {
  id: string;
  name: string | null;
  logo_url: string | null;
  status: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  subscription_expires_at: string | null;
}

export interface AuthBootstrapRole {
  id: string;
  company_id: string;
  name: string | null;
  description: string | null;
  is_system: boolean | null;
}

export interface AuthBootstrapPermission {
  id: string;
  category: string | null;
  module: string | null;
  action: string | null;
  code: string | null;
  description: string | null;
}

export interface AuthBootstrapPayload {
  profile: AuthBootstrapProfile | null;
  company: AuthBootstrapCompany | null;
  roles: AuthBootstrapRole[];
  permissions: AuthBootstrapPermission[];
}

function isMissingRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("load_user_auth_context")
    && (
      normalized.includes("could not find")
      || normalized.includes("not found")
      || normalized.includes("42883")
      || normalized.includes("pgrst202")
    )
  );
}

function parseRpcPayload(raw: unknown): AuthBootstrapPayload {
  return parseRpcPayloadForTest(raw);
}

async function loadAuthContextViaRpc(userId: string): Promise<AuthBootstrapPayload> {
  const { data, error } = await supabase.rpc("load_user_auth_context", {
    p_user_id: userId,
  });
  if (error) throw error;
  const payload = parseRpcPayload(data);
  omniCompanyTrace("load_user_auth_context", {
    userId,
    profileCompanyId: payload.profile?.company_id ?? null,
    companyRecordId: payload.company?.id ?? null,
    companyId: payload.profile?.company_id ?? null,
    extra: { source: "rpc", profileId: payload.profile?.id ?? null },
  });
  return payload;
}

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("does not exist")
    && (normalized.includes("column") || normalized.includes("42703"));
}

async function loadProfile(userId: string): Promise<AuthBootstrapProfile | null> {
  const profileColumnsFull =
    "id, company_id, full_name, is_super_admin, preferred_language, timezone, avatar_url";
  const profileColumnsLegacy = "id, company_id, full_name, is_super_admin";

  const byId = await supabase.from("profiles").select(profileColumnsFull).eq("id", userId).maybeSingle();
  if (!byId.error && byId.data) {
    return normalizeAuthBootstrapProfile(byId.data);
  }

  if (byId.error && !isMissingColumnError(byId.error.message)) {
    const byUserId = await supabase
      .from("profiles")
      .select(profileColumnsFull)
      .eq("user_id", userId)
      .maybeSingle();
    if (!byUserId.error && byUserId.data) {
      return normalizeAuthBootstrapProfile(byUserId.data);
    }
    if (byUserId.error && !isMissingColumnError(byUserId.error.message)) {
      throw byUserId.error;
    }
  }

  const legacyById = await supabase.from("profiles").select(profileColumnsLegacy).eq("id", userId).maybeSingle();
  if (!legacyById.error && legacyById.data) {
    return normalizeAuthBootstrapProfile({
      ...legacyById.data,
      preferred_language: null,
      timezone: "UTC",
      avatar_url: null,
    });
  }

  const legacyByUserId = await supabase
    .from("profiles")
    .select(profileColumnsLegacy)
    .eq("user_id", userId)
    .maybeSingle();
  if (legacyByUserId.error) throw legacyByUserId.error;
  return legacyByUserId.data
    ? normalizeAuthBootstrapProfile({
        ...legacyByUserId.data,
        preferred_language: null,
        timezone: "UTC",
        avatar_url: null,
      })
    : null;
}

/** Fallback path when RPC is unavailable (pre-migration clients). */
async function loadAuthContextSequential(userId: string): Promise<AuthBootstrapPayload> {
  const profile = await loadProfile(userId);
  if (!profile) {
    return { profile: null, company: null, roles: [], permissions: [] };
  }

  const [companyResult, userRoleResult, userPermissionResult] = await Promise.all([
    profile.company_id
      ? supabase
          .from("companies")
          .select(
            "id, name, logo_url, status, subscription_status, billing_cycle, subscription_expires_at",
          )
          .eq("id", profile.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("user_roles").select("role_id").eq("user_id", userId),
    supabase.from("user_permissions").select("permission_id").eq("user_id", userId),
  ]);

  const assignedRoleIds = (userRoleResult.data ?? [])
    .map((row) => row.role_id)
    .filter(Boolean) as string[];

  const permissionIds = new Set<string>();
  for (const row of userPermissionResult.data ?? []) {
    if (row.permission_id) permissionIds.add(row.permission_id);
  }

  const [rolesResult, rolePermissionResult] = await Promise.all([
    assignedRoleIds.length > 0
      ? supabase
          .from("roles")
          .select("id, company_id, name, description, is_system")
          .in("id", assignedRoleIds)
      : Promise.resolve({ data: [], error: null }),
    assignedRoleIds.length > 0
      ? supabase.from("role_permissions").select("permission_id").in("role_id", assignedRoleIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const row of rolePermissionResult.data ?? []) {
    if (row.permission_id) permissionIds.add(row.permission_id);
  }

  const permissionIdList = Array.from(permissionIds);
  const permissionsResult =
    permissionIdList.length > 0
      ? await supabase
          .from("permissions")
          .select("id, category, module, action, code, description")
          .in("id", permissionIdList)
      : { data: [], error: null };

  if (companyResult.error) throw companyResult.error;
  if (userRoleResult.error) throw userRoleResult.error;
  if (userPermissionResult.error) throw userPermissionResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (rolePermissionResult.error) throw rolePermissionResult.error;
  if (permissionsResult.error) throw permissionsResult.error;

  return {
    profile,
    company: (companyResult.data as AuthBootstrapCompany | null) ?? null,
    roles: (rolesResult.data ?? []) as AuthBootstrapRole[],
    permissions: (permissionsResult.data ?? []) as AuthBootstrapPermission[],
  };
}

function traceSequentialBootstrap(userId: string, payload: AuthBootstrapPayload) {
  omniCompanyTrace("load_user_auth_context.sequential_fallback", {
    userId,
    profileCompanyId: payload.profile?.company_id ?? null,
    companyRecordId: payload.company?.id ?? null,
    companyId: payload.profile?.company_id ?? null,
    extra: { source: "sequential_fallback", profileId: payload.profile?.id ?? null },
  });
}

export async function fetchUserAuthContext(userId: string): Promise<AuthBootstrapPayload> {
  try {
    return await loadAuthContextViaRpc(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingRpcError(message)) {
      throw error;
    }
    const payload = await loadAuthContextSequential(userId);
    traceSequentialBootstrap(userId, payload);
    return payload;
  }
}
