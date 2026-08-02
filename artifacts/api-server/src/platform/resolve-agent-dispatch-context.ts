import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServiceContext } from "@workspace/channel-platform";
import type { Request } from "express";
import { HttpError } from "../middleware/error-handler.js";

async function loadUserPermissionCodes(
  client: SupabaseClient,
  userId: string,
  companyId: string,
): Promise<Set<string>> {
  const permissionIds = new Set<string>();

  const [{ data: userRoles, error: userRolesError }, { data: userPermissions, error: userPermissionsError }] =
    await Promise.all([
      client.from("user_roles").select("role_id").eq("user_id", userId),
      client.from("user_permissions").select("permission_id").eq("user_id", userId),
    ]);

  if (userRolesError) throw userRolesError;
  if (userPermissionsError) throw userPermissionsError;

  for (const row of userPermissions ?? []) {
    if (row.permission_id) permissionIds.add(row.permission_id);
  }

  const roleIds = (userRoles ?? []).map((row) => row.role_id).filter(Boolean) as string[];
  if (roleIds.length === 0 && permissionIds.size === 0) {
    return new Set();
  }

  const [{ data: roles, error: rolesError }, { data: rolePermissions, error: rolePermissionsError }] =
    await Promise.all([
      roleIds.length > 0
        ? client.from("roles").select("id, company_id").in("id", roleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; company_id: string | null }>, error: null }),
      roleIds.length > 0
        ? client.from("role_permissions").select("permission_id, role_id").in("role_id", roleIds)
        : Promise.resolve({ data: [] as Array<{ permission_id: string | null; role_id: string | null }>, error: null }),
    ]);

  if (rolesError) throw rolesError;
  if (rolePermissionsError) throw rolePermissionsError;

  const companyRoleIds = new Set(
    (roles ?? []).filter((role) => role.company_id === companyId).map((role) => role.id),
  );

  for (const row of rolePermissions ?? []) {
    if (row.permission_id && row.role_id && companyRoleIds.has(row.role_id)) {
      permissionIds.add(row.permission_id);
    }
  }

  if (permissionIds.size === 0) {
    return new Set();
  }

  const { data: permissions, error: permissionsError } = await client
    .from("permissions")
    .select("code")
    .in("id", Array.from(permissionIds));

  if (permissionsError) throw permissionsError;

  return new Set(
    (permissions ?? [])
      .map((permission) => permission.code?.trim())
      .filter((code): code is string => Boolean(code)),
  );
}

export async function resolveAgentDispatchContext(
  client: SupabaseClient,
  req: Request,
  companyId: string,
): Promise<ServiceContext> {
  if (req.supabaseIsSuperAdmin) {
    return {
      userId: req.supabaseUser?.id ?? null,
      companyId,
      isSuperAdmin: true,
      hasPermission: () => true,
    };
  }

  const userId = req.supabaseUser?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }

  const permissionCodes = await loadUserPermissionCodes(client, userId, companyId);

  return {
    userId,
    companyId,
    isSuperAdmin: false,
    hasPermission: (permissionCode: string) => permissionCodes.has(permissionCode),
  };
}
