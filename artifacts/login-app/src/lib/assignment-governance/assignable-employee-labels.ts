import type { AssignableEmployee } from "@workspace/assignment-governance";

/** Branch-aware label for assignment selectors (person first; dept is context only). */
export function formatAssignableEmployeeLabel(row: AssignableEmployee): string {
  const email = row.email?.trim() || null;
  const rawName = row.fullName?.trim() || null;
  const dept = row.departmentName?.trim() || null;
  const branch = row.branchName?.trim() || null;
  // If the stored "name" is just the department, prefer email so the picker never looks dept-only.
  const nameLooksLikeDept = Boolean(rawName && dept && rawName.toLowerCase() === dept.toLowerCase());
  const name = (nameLooksLikeDept ? email : rawName) || email || row.userId;
  const context = [dept, branch].filter(Boolean).join(" — ");
  if (context && name.toLowerCase() !== context.toLowerCase()) return `${name} · ${context}`;
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
