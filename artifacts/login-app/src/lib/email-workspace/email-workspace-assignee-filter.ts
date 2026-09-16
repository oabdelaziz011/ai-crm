/**
 * Email Workspace Inbox — Assigned To list filter (URL + query mapping).
 * Subordinate to ConversationService visibility; does not assign.
 */
export const EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY = "assignee";

export const EMAIL_WORKSPACE_ASSIGNEE_ALL = "all";
export const EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED = "unassigned";

export type EmailWorkspaceAssigneeFilter =
  | typeof EMAIL_WORKSPACE_ASSIGNEE_ALL
  | typeof EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED
  | string;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEmailWorkspaceAssigneeUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Parse URL/search assignee param.
 * - missing / "all" → All
 * - "unassigned" → Unassigned
 * - valid UUID → that auth user id
 * - anything else → All (fail closed)
 */
export function parseEmailWorkspaceAssigneeFilter(
  raw: string | null | undefined,
): EmailWorkspaceAssigneeFilter {
  if (!raw) return EMAIL_WORKSPACE_ASSIGNEE_ALL;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === EMAIL_WORKSPACE_ASSIGNEE_ALL) {
    return EMAIL_WORKSPACE_ASSIGNEE_ALL;
  }
  if (trimmed === EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED) {
    return EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED;
  }
  if (isEmailWorkspaceAssigneeUserId(trimmed)) return trimmed;
  return EMAIL_WORKSPACE_ASSIGNEE_ALL;
}

export function readEmailWorkspaceAssigneeFromSearch(
  search: string,
): EmailWorkspaceAssigneeFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parseEmailWorkspaceAssigneeFilter(params.get(EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY));
}

/**
 * Map UI filter → ConversationListFilters.assignedUserId.
 * undefined = no assignee predicate (All).
 * null = IS NULL (Unassigned).
 * string = eq assigned_user_id.
 */
export function assigneeFilterToListAssignedUserId(
  filter: EmailWorkspaceAssigneeFilter,
): string | null | undefined {
  if (filter === EMAIL_WORKSPACE_ASSIGNEE_ALL) return undefined;
  if (filter === EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED) return null;
  return filter;
}

export function writeAssigneeToSearchParams(
  params: URLSearchParams,
  assignee: EmailWorkspaceAssigneeFilter | null | undefined,
): void {
  if (!assignee || assignee === EMAIL_WORKSPACE_ASSIGNEE_ALL) {
    params.delete(EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY);
    return;
  }
  params.set(EMAIL_WORKSPACE_ASSIGNEE_QUERY_KEY, assignee);
}
