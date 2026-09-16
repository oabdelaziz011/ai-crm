/**
 * Presentation helpers for the Roles administration list.
 * Category is always derived from canonical `role_type`, never from the display name.
 */

export const CANONICAL_ROLE_TYPES = ["PLATFORM", "DEFAULT", "CUSTOM"] as const;
export type CanonicalRoleType = (typeof CANONICAL_ROLE_TYPES)[number];

export const ROLES_LIST_PAGE_SIZE = 10;

export type RoleTypeFilter = "ALL" | CanonicalRoleType;
export type RoleSortKey = "updated_at" | "name" | "permission_count" | "user_count";
export type RoleSortDirection = "asc" | "desc";

export type RoleListLike = {
  id: string;
  name?: string | null;
  description?: string | null;
  company_id?: string | null;
  role_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type RoleListActions = {
  view: boolean;
  edit: boolean;
  delete: boolean;
  viewOnly: boolean;
};

export type RoleListCountsLookup = {
  permissionCountByRoleId?: Record<string, number>;
  userCountByRoleId?: Record<string, number>;
};

/** Unknown / missing DB types default to CUSTOM — never infer from the role name. */
export function canonicalRoleType(role: { role_type?: string | null }): CanonicalRoleType {
  const type = role.role_type;
  if (type === "PLATFORM" || type === "DEFAULT" || type === "CUSTOM") return type;
  return "CUSTOM";
}

/**
 * Real PLATFORM Super Admin. A tenant CUSTOM role whose display name is
 * "Super Admin" is not identified as the platform role.
 */
export function isPlatformSuperAdminRole(role: {
  role_type?: string | null;
  company_id?: string | null;
  name?: string | null;
}): boolean {
  return canonicalRoleType(role) === "PLATFORM";
}

export function isProtectedRoleType(role: { role_type?: string | null }): boolean {
  const type = canonicalRoleType(role);
  return type === "PLATFORM" || type === "DEFAULT";
}

export function canMutateRoleFromList(role: { role_type?: string | null }): boolean {
  return canonicalRoleType(role) === "CUSTOM";
}

export function canDeleteRoleFromList(role: { role_type?: string | null }): boolean {
  return canonicalRoleType(role) === "CUSTOM";
}

export function assertRoleTypeDeletable(roleType: string | null | undefined): void {
  if (roleType === "PLATFORM" || roleType === "DEFAULT") {
    throw new Error("ROLE_PROTECTED_READ_ONLY");
  }
}

export function roleSearchHaystack(role: {
  name?: string | null;
  description?: string | null;
}): string {
  return [role.name, role.description]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();
}

export function roleMatchesSearch(role: RoleListLike, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return roleSearchHaystack(role).includes(needle);
}

export function filterRolesByType<T extends RoleListLike>(
  roles: readonly T[],
  filter: RoleTypeFilter,
): T[] {
  if (filter === "ALL") return [...roles];
  return roles.filter((role) => canonicalRoleType(role) === filter);
}

export function presentRoleTypeFilters(roles: readonly RoleListLike[]): RoleTypeFilter[] {
  const present = new Set(roles.map((role) => canonicalRoleType(role)));
  const options: RoleTypeFilter[] = ["ALL"];
  if (present.has("PLATFORM")) options.push("PLATFORM");
  if (present.has("DEFAULT")) options.push("DEFAULT");
  if (present.has("CUSTOM")) options.push("CUSTOM");
  return options;
}

/**
 * Workspace console shows PLATFORM (company_id IS NULL) plus the current
 * company's DEFAULT/CUSTOM roles. Super Admin RLS can return every tenant;
 * this is presentation scoping only — it does not change authorization.
 */
export function scopeRolesToWorkspace<T extends RoleListLike>(
  roles: readonly T[],
  companyId: string | null | undefined,
): T[] {
  return roles.filter((role) => {
    if (canonicalRoleType(role) === "PLATFORM") {
      return role.company_id == null;
    }
    if (!companyId) return false;
    return role.company_id === companyId;
  });
}

export function summarizeWorkspaceRoles(roles: readonly RoleListLike[]) {
  let platform = 0;
  let defaultCount = 0;
  let custom = 0;
  for (const role of roles) {
    const type = canonicalRoleType(role);
    if (type === "PLATFORM") platform += 1;
    else if (type === "DEFAULT") defaultCount += 1;
    else custom += 1;
  }
  return { platform, default: defaultCount, custom, total: roles.length };
}

export function listActionsForRole(
  role: RoleListLike,
  permissions: { canView: boolean; canEdit: boolean; canDelete: boolean },
): RoleListActions {
  const protectedRole = isProtectedRoleType(role);
  return {
    view: permissions.canView,
    edit: permissions.canEdit && canMutateRoleFromList(role),
    delete: permissions.canDelete && canDeleteRoleFromList(role),
    viewOnly: protectedRole,
  };
}

export function countByKey(rows: readonly { role_id?: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const id = row.role_id;
    if (!id) continue;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

export function uniqueUserCount(rows: readonly { user_id?: string | null }[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.user_id) seen.add(row.user_id);
  }
  return seen.size;
}

function typeRank(role: RoleListLike): number {
  const type = canonicalRoleType(role);
  if (type === "PLATFORM") return 0;
  if (type === "DEFAULT") return 1;
  return 2;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function sortRoles<T extends RoleListLike>(
  roles: readonly T[],
  key: RoleSortKey,
  direction: RoleSortDirection,
  counts: RoleListCountsLookup = {},
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...roles].sort((left, right) => {
    let delta = 0;
    if (key === "name") {
      delta = compareText(left.name?.trim() || left.id, right.name?.trim() || right.id);
    } else if (key === "permission_count") {
      const leftCount = counts.permissionCountByRoleId?.[left.id] ?? -1;
      const rightCount = counts.permissionCountByRoleId?.[right.id] ?? -1;
      delta = leftCount - rightCount;
    } else if (key === "user_count") {
      const leftCount = counts.userCountByRoleId?.[left.id] ?? -1;
      const rightCount = counts.userCountByRoleId?.[right.id] ?? -1;
      delta = leftCount - rightCount;
    } else {
      const leftStamp = Date.parse(left.updated_at || left.created_at || "") || 0;
      const rightStamp = Date.parse(right.updated_at || right.created_at || "") || 0;
      delta = leftStamp - rightStamp;
    }
    if (delta !== 0) return delta * sign;
    const typeDelta = typeRank(left) - typeRank(right);
    if (typeDelta !== 0) return typeDelta;
    return compareText(left.id, right.id);
  });
}

export function paginateRoles<T>(
  roles: readonly T[],
  page: number,
  pageSize = ROLES_LIST_PAGE_SIZE,
): {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
} {
  const total = roles.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return {
    items: roles.slice(start, end),
    page: safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}

export function applyRolesListQuery<T extends RoleListLike>(
  roles: readonly T[],
  input: {
    search: string;
    typeFilter: RoleTypeFilter;
    sortKey: RoleSortKey;
    sortDirection?: RoleSortDirection;
    page: number;
    pageSize?: number;
    counts?: RoleListCountsLookup;
  },
) {
  const searched = roles.filter((role) => roleMatchesSearch(role, input.search));
  const typed = filterRolesByType(searched, input.typeFilter);
  const sorted = sortRoles(typed, input.sortKey, input.sortDirection ?? "desc", input.counts);
  return {
    filteredTotal: typed.length,
    ...paginateRoles(sorted, input.page, input.pageSize),
  };
}
