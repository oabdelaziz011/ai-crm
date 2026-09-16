/**
 * Canonical employee ↔ department membership helpers (Phase 2).
 * department_id is authoritative; profiles.department is legacy/display text.
 */

export type DepartmentMembershipOption = {
  id: string;
  name: string;
  branchId?: string | null;
  branchName?: string | null;
};

/** Branch-aware label so same-name departments stay distinguishable. */
export function formatDepartmentOptionLabel(
  name: string,
  branchName?: string | null,
): string {
  const trimmedName = name.trim();
  const trimmedBranch = branchName?.trim();
  if (trimmedBranch) return `${trimmedName} — ${trimmedBranch}`;
  return trimmedName;
}

/**
 * Resolve display name for lists.
 * Prefer canonical department_id → org name; LEGACY FALLBACK to profiles.department text.
 */
export function resolveEmployeeDepartmentDisplay(input: {
  departmentId: string | null | undefined;
  legacyDepartmentText: string | null | undefined;
  departmentsById: Map<string, { name: string; branchName?: string | null }>;
  includeBranch?: boolean;
}): string | null {
  const id = input.departmentId?.trim() || null;
  if (id) {
    const dept = input.departmentsById.get(id);
    if (dept) {
      return input.includeBranch
        ? formatDepartmentOptionLabel(dept.name, dept.branchName)
        : dept.name.trim() || null;
    }
  }

  // LEGACY FALLBACK — only when department_id is missing or unresolved.
  const legacy = input.legacyDepartmentText?.trim();
  return legacy || null;
}

/** Build write payload: id authoritative, text mirrored for compatibility. */
export function buildDepartmentMembershipWrite(
  departmentId: string | null | undefined,
  departments: ReadonlyArray<DepartmentMembershipOption>,
): { department_id: string | null; department: string | null } {
  const id = departmentId?.trim() || null;
  if (!id) {
    return { department_id: null, department: null };
  }
  const match = departments.find((d) => d.id === id);
  if (!match) {
    throw new Error("Selected department is not available for this company");
  }
  return {
    department_id: match.id,
    department: match.name.trim() || null,
  };
}
