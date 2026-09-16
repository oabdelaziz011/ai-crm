import type { AssignableRoleRecord } from "@/lib/users/role-company-validation";

export type EmployeeRoleOption = {
  value: string;
  label: string;
  description?: string;
  /** Present when the employee still has a role that is no longer assignable. */
  currentOnly?: boolean;
};

export type CurrentEmployeeRole = {
  roleId: string;
  roleName?: string | null;
};

/**
 * Employee Role dropdown options from the canonical assignable-roles source.
 * PLATFORM roles are never assignable. The employee's current role stays visible
 * even if it is no longer in the assignable catalog.
 */
export function buildEmployeeRoleOptions(input: {
  assignableRoles: readonly AssignableRoleRecord[];
  currentRole?: CurrentEmployeeRole | null;
  currentOnlyLabel: string;
}): EmployeeRoleOption[] {
  const seen = new Set<string>();
  const options: EmployeeRoleOption[] = [];

  for (const role of input.assignableRoles) {
    if (!role.id || role.role_type === "PLATFORM") continue;
    if (seen.has(role.id)) continue;
    seen.add(role.id);
    options.push({
      value: role.id,
      label: role.name?.trim() || role.id,
      description: role.description?.trim() || undefined,
    });
  }

  const currentId = input.currentRole?.roleId?.trim();
  if (currentId && !seen.has(currentId)) {
    options.unshift({
      value: currentId,
      label: input.currentRole?.roleName?.trim() || currentId,
      description: input.currentOnlyLabel,
      currentOnly: true,
    });
  }

  return options;
}

export function isHardcodedRoleNameList(source: string): boolean {
  return /\[[^\]]*(['"]admin['"]\s*,\s*['"]manager['"]\s*,\s*['"]employee['"])[^\]]*\]/.test(
    source,
  );
}
