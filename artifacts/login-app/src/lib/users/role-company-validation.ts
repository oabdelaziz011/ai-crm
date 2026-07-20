export const ROLE_ASSIGNMENT_REJECTION = {
  ROLE_NOT_FOUND: "role_not_found",
  TARGET_COMPANY_REQUIRED: "target_company_required",
  ROLE_TENANT_MISMATCH: "role_tenant_mismatch",
  LAST_COMPANY_ADMIN: "last_company_admin",
  FORBIDDEN: "forbidden",
} as const;

export type RoleAssignmentRejectionCode =
  (typeof ROLE_ASSIGNMENT_REJECTION)[keyof typeof ROLE_ASSIGNMENT_REJECTION];

export class RoleAssignmentError extends Error {
  readonly code: RoleAssignmentRejectionCode;

  constructor(code: RoleAssignmentRejectionCode, message: string) {
    super(message);
    this.name = "RoleAssignmentError";
    this.code = code;
  }
}

export type AssignableRoleRecord = {
  id: string;
  company_id?: string | null;
  is_system?: boolean | null;
  role_type?: "PLATFORM" | "DEFAULT" | "CUSTOM" | null;
  name?: string | null;
  description?: string | null;
};

/**
 * A role is assignable to a company when it belongs to that tenant.
 * Platform roles are never assignable to tenant users.
 */
export function isRoleAssignableToCompany(
  role: AssignableRoleRecord | null | undefined,
  companyId: string | null | undefined,
): boolean {
  if (!role?.id || !companyId) {
    return false;
  }
  if (role.role_type === "PLATFORM") {
    return false;
  }
  if (!role.company_id) {
    return false;
  }
  return role.company_id === companyId;
}

export function filterRolesForCompany<T extends AssignableRoleRecord>(
  roles: T[],
  companyId: string | null | undefined,
): T[] {
  if (!companyId) {
    return [];
  }
  return roles.filter((role) => isRoleAssignableToCompany(role, companyId));
}

export function assertRoleAssignableToCompany(
  role: AssignableRoleRecord | null | undefined,
  targetCompanyId: string | null | undefined,
): void {
  if (!targetCompanyId) {
    throw new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.TARGET_COMPANY_REQUIRED,
      "Target company is required before assigning a role.",
    );
  }

  if (!role) {
    throw new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.ROLE_NOT_FOUND,
      "The selected role was not found.",
    );
  }

  if (!isRoleAssignableToCompany(role, targetCompanyId)) {
    throw new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.ROLE_TENANT_MISMATCH,
      "The selected role does not belong to the target company.",
    );
  }
}

export class CompanyHasNoRolesError extends Error {
  constructor(message = "This company has no roles configured.") {
    super(message);
    this.name = "CompanyHasNoRolesError";
  }
}

export async function assertCompanyHasAssignableRoles(
  companyId: string,
): Promise<void> {
  const { fetchAssignableRolesForCompany } = await import("@/lib/users/fetch-assignable-roles");
  const roles = await fetchAssignableRolesForCompany(companyId);

  if (roles.length === 0) {
    throw new CompanyHasNoRolesError();
  }
}

export async function fetchRoleForAssignment(
  roleId: string,
  targetCompanyId?: string | null,
): Promise<AssignableRoleRecord | null> {
  if (!targetCompanyId) {
    return null;
  }

  const { fetchAssignableRolesForCompany } = await import("@/lib/users/fetch-assignable-roles");
  const roles = await fetchAssignableRolesForCompany(targetCompanyId);
  return roles.find((role) => role.id === roleId) ?? null;
}

export async function fetchProfileCompanyId(userId: string): Promise<string | null> {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.company_id as string | null | undefined) ?? null;
}

export async function validateUserRoleAssignment(
  userId: string,
  roleId: string,
  targetCompanyId?: string | null,
): Promise<void> {
  const companyId = targetCompanyId ?? (await fetchProfileCompanyId(userId));
  const role = await fetchRoleForAssignment(roleId, companyId);
  assertRoleAssignableToCompany(role, companyId);
}

export async function validateRoleBelongsToCompany(
  roleId: string,
  targetCompanyId: string,
): Promise<void> {
  const role = await fetchRoleForAssignment(roleId, targetCompanyId);
  assertRoleAssignableToCompany(role, targetCompanyId);
}

export async function validateBulkUserRoleAssignment(
  userId: string,
  roleIds: string[],
  targetCompanyId?: string | null,
): Promise<void> {
  const companyId = targetCompanyId ?? (await fetchProfileCompanyId(userId));
  if (!companyId) {
    throw new RoleAssignmentError(
      ROLE_ASSIGNMENT_REJECTION.TARGET_COMPANY_REQUIRED,
      "Target company is required before assigning roles.",
    );
  }

  for (const roleId of roleIds) {
    const role = await fetchRoleForAssignment(roleId, companyId);
    assertRoleAssignableToCompany(role, companyId);
  }
}

async function getSupabaseClient() {
  const { supabase } = await import("@/lib/supabase");
  return supabase;
}
