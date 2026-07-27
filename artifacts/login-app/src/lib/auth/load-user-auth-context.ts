import { supabase } from "@/lib/supabase";

export interface AuthBootstrapProfile {
  id: string;
  company_id: string | null;
  full_name: string | null;
  is_super_admin: boolean;
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
  const record = (raw ?? {}) as Record<string, unknown>;
  const profile = (record.profile as AuthBootstrapProfile | null) ?? null;
  const company = (record.company as AuthBootstrapCompany | null) ?? null;
  const roles = Array.isArray(record.roles) ? (record.roles as AuthBootstrapRole[]) : [];
  const permissions = Array.isArray(record.permissions)
    ? (record.permissions as AuthBootstrapPermission[])
    : [];
  return { profile, company, roles, permissions };
}

async function loadAuthContextViaRpc(userId: string): Promise<AuthBootstrapPayload> {
  const { data, error } = await supabase.rpc("load_user_auth_context", {
    p_user_id: userId,
  });
  if (error) throw error;
  return parseRpcPayload(data);
}

async function loadProfile(userId: string): Promise<AuthBootstrapProfile | null> {
  const profileColumns = "id, company_id, full_name, is_super_admin";
  const byId = await supabase.from("profiles").select(profileColumns).eq("id", userId).maybeSingle();
  if (!byId.error && byId.data) return byId.data as AuthBootstrapProfile;
  const byUserId = await supabase
    .from("profiles")
    .select(profileColumns)
    .eq("user_id", userId)
    .maybeSingle();
  if (byUserId.error) throw byUserId.error;
  return (byUserId.data as AuthBootstrapProfile | null) ?? null;
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

export async function fetchUserAuthContext(userId: string): Promise<AuthBootstrapPayload> {
  try {
    return await loadAuthContextViaRpc(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isMissingRpcError(message)) {
      throw error;
    }
    return loadAuthContextSequential(userId);
  }
}
