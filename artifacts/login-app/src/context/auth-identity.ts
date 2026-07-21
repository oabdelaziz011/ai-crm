import type { Session } from "@supabase/supabase-js";

export type AuthIdentitySnapshot = {
  userId: string;
  companyId: string | null;
  roleIds: string;
};

export function roleIdsSignature(roles: Array<{ id: string }>): string {
  return roles
    .map((role) => role.id)
    .sort()
    .join(",");
}

export function createAuthIdentitySnapshot(
  userId: string,
  companyId: string | null,
  roles: Array<{ id: string }>,
): AuthIdentitySnapshot {
  return {
    userId,
    companyId,
    roleIds: roleIdsSignature(roles),
  };
}

/** User-visible session fields that should trigger auth context consumers to rerender. */
export function isAuthUserVisibleEqual(current: Session | null, next: Session | null): boolean {
  if (current === next) return true;
  if (!current || !next) return false;

  const currentUser = current.user;
  const nextUser = next.user;
  if (!currentUser || !nextUser) return currentUser === nextUser;

  return (
    currentUser.id === nextUser.id &&
    currentUser.email === nextUser.email &&
    currentUser.role === nextUser.role
  );
}

/** Session refresh only — skip RBAC reload when user, tenant, and roles are unchanged. */
export function shouldSkipTokenRefreshReload(input: {
  loadedUserId: string | null;
  nextUserId: string;
  hasProfile: boolean;
  loadedIdentity: AuthIdentitySnapshot | null;
  profileCompanyId: string | null;
  roles: Array<{ id: string }>;
}): boolean {
  if (!input.hasProfile || input.loadedUserId !== input.nextUserId || !input.loadedIdentity) {
    return false;
  }

  const nextIdentity = createAuthIdentitySnapshot(input.nextUserId, input.profileCompanyId, input.roles);
  return (
    input.loadedIdentity.userId === nextIdentity.userId &&
    input.loadedIdentity.companyId === nextIdentity.companyId &&
    input.loadedIdentity.roleIds === nextIdentity.roleIds
  );
}

export function arraysEqualById<T extends { id: string }>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right.map((item) => item.id));
  return left.every((item) => rightIds.has(item.id));
}

export function permissionsEqual(
  left: Array<{ id: string; code: string | null }>,
  right: Array<{ id: string; code: string | null }>,
): boolean {
  if (left.length !== right.length) return false;
  const rightById = new Map(right.map((item) => [item.id, item.code ?? ""]));
  return left.every((item) => rightById.get(item.id) === (item.code ?? ""));
}
