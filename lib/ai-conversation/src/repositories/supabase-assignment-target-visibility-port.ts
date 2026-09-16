/**
 * Authoritative Assignment Target Visibility loader (Phase 6D Step 3).
 * Loads target profile + permission codes + managed departments from the database.
 * Never trusts client-supplied permission / department / super-admin flags.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssignmentTargetVisibilityPort,
  AssignmentTargetVisibilitySnapshot,
} from "../services/assignment-visibility-compatibility.js";

async function loadPermissionCodes(
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

  if (userRolesError) throw new Error(userRolesError.message);
  if (userPermissionsError) throw new Error(userPermissionsError.message);

  for (const row of userPermissions ?? []) {
    if (row.permission_id) permissionIds.add(String(row.permission_id));
  }

  const roleIds = (userRoles ?? [])
    .map((row) => (row.role_id ? String(row.role_id) : ""))
    .filter(Boolean);

  if (roleIds.length > 0) {
    const [{ data: roles, error: rolesError }, { data: rolePermissions, error: rolePermissionsError }] =
      await Promise.all([
        client.from("roles").select("id, company_id").in("id", roleIds),
        client.from("role_permissions").select("permission_id, role_id").in("role_id", roleIds),
      ]);

    if (rolesError) throw new Error(rolesError.message);
    if (rolePermissionsError) throw new Error(rolePermissionsError.message);

    const companyRoleIds = new Set(
      (roles ?? [])
        .filter((role) => role.company_id === companyId)
        .map((role) => String(role.id)),
    );

    for (const row of rolePermissions ?? []) {
      if (row.permission_id && row.role_id && companyRoleIds.has(String(row.role_id))) {
        permissionIds.add(String(row.permission_id));
      }
    }
  }

  if (permissionIds.size === 0) {
    return new Set();
  }

  const { data: permissions, error: permissionsError } = await client
    .from("permissions")
    .select("code")
    .in("id", Array.from(permissionIds));

  if (permissionsError) throw new Error(permissionsError.message);

  return new Set(
    (permissions ?? [])
      .map((row) => (typeof row.code === "string" ? row.code.trim() : ""))
      .filter((code) => code.length > 0),
  );
}

export function createSupabaseAssignmentTargetVisibilityPort(
  client: SupabaseClient,
): AssignmentTargetVisibilityPort {
  return {
    async loadTargetVisibilitySnapshot(input): Promise<AssignmentTargetVisibilitySnapshot | null> {
      const targetUserId = input.targetUserId.trim();
      const companyId = input.companyId.trim();
      if (!targetUserId || !companyId) return null;

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("id, company_id, is_active, is_super_admin, department_id")
        .eq("id", targetUserId)
        .maybeSingle();

      if (profileError) throw new Error(profileError.message);
      if (!profile) return null;

      const profileCompanyId = profile.company_id ? String(profile.company_id) : null;
      // Fail closed on cross-company / missing company before loading permissions.
      if (!profileCompanyId || profileCompanyId !== companyId) {
        return null;
      }

      const [permissionCodes, managedResult] = await Promise.all([
        loadPermissionCodes(client, targetUserId, companyId),
        client
          .from("organization_departments")
          .select("id")
          .eq("company_id", companyId)
          .eq("manager_user_id", targetUserId)
          .eq("is_active", true),
      ]);

      if (managedResult.error) throw new Error(managedResult.error.message);

      const managedDepartmentIds = (managedResult.data ?? [])
        .map((row) => (row.id ? String(row.id) : ""))
        .filter((id) => id.length > 0);

      return {
        userId: String(profile.id),
        companyId: profileCompanyId,
        isActive: profile.is_active !== false,
        isSuperAdmin: profile.is_super_admin === true,
        departmentId: profile.department_id ? String(profile.department_id) : null,
        managedDepartmentIds,
        permissionCodes,
      };
    },
  };
}
