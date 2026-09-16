import type { AssignmentAuditAction } from "./types.js";

function normalizeAssignee(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function resolveAssignmentAction(
  previousAssigneeUserId: string | null | undefined,
  newAssigneeUserId: string | null | undefined,
): AssignmentAuditAction | null {
  const previous = normalizeAssignee(previousAssigneeUserId);
  const next = normalizeAssignee(newAssigneeUserId);
  if (previous === next) return null;
  if (!previous && next) return "assigned";
  if (previous && !next) return "unassigned";
  return "reassigned";
}
