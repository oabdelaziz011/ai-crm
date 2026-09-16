/**
 * SMS Workspace Inbox — Assigned To list filter (URL + query mapping).
 * Subordinate to ConversationService visibility; does not assign.
 */
export const SMS_WORKSPACE_ASSIGNEE_QUERY_KEY = "assignee";

export const SMS_WORKSPACE_ASSIGNEE_ALL = "all";
export const SMS_WORKSPACE_ASSIGNEE_UNASSIGNED = "unassigned";

export type SmsWorkspaceAssigneeFilter =
  | typeof SMS_WORKSPACE_ASSIGNEE_ALL
  | typeof SMS_WORKSPACE_ASSIGNEE_UNASSIGNED
  | string;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSmsWorkspaceAssigneeUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseSmsWorkspaceAssigneeFilter(
  raw: string | null | undefined,
): SmsWorkspaceAssigneeFilter {
  if (!raw) return SMS_WORKSPACE_ASSIGNEE_ALL;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === SMS_WORKSPACE_ASSIGNEE_ALL) {
    return SMS_WORKSPACE_ASSIGNEE_ALL;
  }
  if (trimmed === SMS_WORKSPACE_ASSIGNEE_UNASSIGNED) {
    return SMS_WORKSPACE_ASSIGNEE_UNASSIGNED;
  }
  if (isSmsWorkspaceAssigneeUserId(trimmed)) return trimmed;
  return SMS_WORKSPACE_ASSIGNEE_ALL;
}

export function readSmsWorkspaceAssigneeFromSearch(
  search: string,
): SmsWorkspaceAssigneeFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return parseSmsWorkspaceAssigneeFilter(params.get(SMS_WORKSPACE_ASSIGNEE_QUERY_KEY));
}

/** Map UI assignee filter → ConversationService list `assignedUserId`. */
export function assigneeFilterToListAssignedUserId(
  filter: SmsWorkspaceAssigneeFilter,
): string | null | undefined {
  if (filter === SMS_WORKSPACE_ASSIGNEE_ALL) return undefined;
  if (filter === SMS_WORKSPACE_ASSIGNEE_UNASSIGNED) return null;
  return filter;
}

/** @deprecated alias — agent panel naming */
export const smsAssigneeFilterToListAssignedUserId = assigneeFilterToListAssignedUserId;

export function writeSmsWorkspaceAssigneeToSearch(
  search: string,
  filter: SmsWorkspaceAssigneeFilter,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (filter === SMS_WORKSPACE_ASSIGNEE_ALL) {
    params.delete(SMS_WORKSPACE_ASSIGNEE_QUERY_KEY);
  } else {
    params.set(SMS_WORKSPACE_ASSIGNEE_QUERY_KEY, filter);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Write assignee into URLSearchParams (panel helper). */
export function writeSmsAssigneeToSearchParams(
  params: URLSearchParams,
  filter: SmsWorkspaceAssigneeFilter,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filter === SMS_WORKSPACE_ASSIGNEE_ALL) {
    next.delete(SMS_WORKSPACE_ASSIGNEE_QUERY_KEY);
  } else {
    next.set(SMS_WORKSPACE_ASSIGNEE_QUERY_KEY, filter);
  }
  return next;
}
