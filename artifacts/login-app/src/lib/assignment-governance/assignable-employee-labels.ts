import type { AssignableEmployee } from "@workspace/assignment-governance";

/** Branch-aware label for assignment selectors. */
export function formatAssignableEmployeeLabel(row: AssignableEmployee): string {
  const name = row.fullName?.trim() || row.email?.trim() || row.userId;
  const dept = row.departmentName?.trim() || null;
  const branch = row.branchName?.trim() || null;
  if (dept && branch) return `${name} · ${dept} — ${branch}`;
  if (dept) return `${name} · ${dept}`;
  return name;
}

export function formatAssignableDepartmentLabel(row: AssignableEmployee): string {
  const dept = row.departmentName?.trim() || null;
  const branch = row.branchName?.trim() || null;
  if (dept && branch) return `${dept} — ${branch}`;
  return dept || "";
}

export function filterAssignableEmployeesBySearch(
  rows: readonly AssignableEmployee[],
  searchQuery: string | null | undefined,
): AssignableEmployee[] {
  const q = searchQuery?.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) => {
    const name = row.fullName?.toLowerCase() ?? "";
    const email = row.email?.toLowerCase() ?? "";
    const dept = row.departmentName?.toLowerCase() ?? "";
    const branch = row.branchName?.toLowerCase() ?? "";
    const userId = row.userId.toLowerCase();
    return (
      name.includes(q) ||
      email.includes(q) ||
      dept.includes(q) ||
      branch.includes(q) ||
      userId.includes(q)
    );
  });
}
