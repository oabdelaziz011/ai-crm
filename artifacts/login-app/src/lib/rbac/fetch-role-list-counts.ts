import { countByKey, uniqueUserCount } from "@/lib/rbac/roles-list";
import { supabase } from "@/lib/supabase";

export const ROLE_LIST_COUNTS_QUERY_KEY = ["rbac", "role-list-counts"] as const;

const USER_ASSIGNMENT_ROW_CAP = 5000;

export type RoleListCounts = {
  permissionCountByRoleId: Record<string, number>;
  userCountByRoleId: Record<string, number>;
  assignedUserTotal: number | null;
};

type RolesQueryClient = Pick<typeof supabase, "from">;

async function exactCountForRole(
  client: RolesQueryClient,
  table: "role_permissions" | "user_roles",
  roleId: string,
): Promise<number> {
  const { count, error } = await client
    .from(table)
    .select("role_id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Canonical counts from `role_permissions` and `user_roles`.
 * If unique assigned-user rows cannot be loaded completely, `assignedUserTotal` is null
 * so the UI does not invent a metric.
 */
export async function fetchRoleListCounts(
  client: RolesQueryClient,
  roleIds: string[],
): Promise<RoleListCounts> {
  if (roleIds.length === 0) {
    return {
      permissionCountByRoleId: {},
      userCountByRoleId: {},
      assignedUserTotal: 0,
    };
  }

  const permissionCountByRoleId: Record<string, number> = {};
  const userCountByRoleId: Record<string, number> = {};

  await Promise.all(
    roleIds.map(async (roleId) => {
      const [permissionCount, userCount] = await Promise.all([
        exactCountForRole(client, "role_permissions", roleId),
        exactCountForRole(client, "user_roles", roleId),
      ]);
      permissionCountByRoleId[roleId] = permissionCount;
      userCountByRoleId[roleId] = userCount;
    }),
  );

  const { data, error } = await client
    .from("user_roles")
    .select("role_id, user_id")
    .in("role_id", roleIds)
    .limit(USER_ASSIGNMENT_ROW_CAP);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const complete = rows.length < USER_ASSIGNMENT_ROW_CAP;
  const assignedUserTotal = complete ? uniqueUserCount(rows) : null;

  if (complete) {
    const fromRows = countByKey(rows);
    for (const roleId of roleIds) {
      if (fromRows[roleId] != null) userCountByRoleId[roleId] = fromRows[roleId];
    }
  }

  return { permissionCountByRoleId, userCountByRoleId, assignedUserTotal };
}
