/**
 * Conversation read visibility — View All vs View Assigned (+ department queue / manager).
 * Durable ownership: conversations.department_id (Phase 6D).
 * Canonical assignee: conversations.assigned_user_id.
 * Manager scope: same definition as AssignmentGovernanceDataPort.listManagedDepartmentIds.
 */

import { CONVERSATION_PERMISSIONS } from "../constants.js";
import { ConversationNotFoundError, PermissionDeniedError } from "../errors.js";
import type { ConversationRecord, ListConversationsFilter, ServiceContext } from "../types.js";

export type ConversationAssignedReadScope = {
  mode: "assigned";
  userId: string;
  /** Actor profiles.department_id — department unassigned queue when non-null. */
  departmentId: string | null;
  /** Active departments where actor is manager_user_id (canonical AG definition). */
  managedDepartmentIds: readonly string[];
};

export type ConversationReadScope =
  | { mode: "all" }
  | ConversationAssignedReadScope
  | { mode: "none" };

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeManagedDepartmentIds(ctx: ServiceContext): string[] {
  const raw = ctx.managedDepartmentIds;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    const normalized = normalizeId(id);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function canViewAllConversations(ctx: ServiceContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission(CONVERSATION_PERMISSIONS.view);
}

export function canViewAssignedConversations(ctx: ServiceContext): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.hasPermission(CONVERSATION_PERMISSIONS.viewAssigned);
}

/** True when the caller may read at least some conversations in the company. */
export function canReadAnyConversations(ctx: ServiceContext): boolean {
  return canViewAllConversations(ctx) || canViewAssignedConversations(ctx);
}

/**
 * Resolve list/read scope.
 * View All wins over View Assigned when both are present.
 */
export function resolveConversationReadScope(ctx: ServiceContext): ConversationReadScope {
  if (canViewAllConversations(ctx)) return { mode: "all" };
  if (canViewAssignedConversations(ctx)) {
    const userId = normalizeId(ctx.userId);
    if (!userId) return { mode: "none" };
    return {
      mode: "assigned",
      userId,
      departmentId: normalizeId(ctx.departmentId ?? null),
      managedDepartmentIds: normalizeManagedDepartmentIds(ctx),
    };
  }
  return { mode: "none" };
}

export function assertCanReadConversations(ctx: ServiceContext): ConversationReadScope {
  const scope = resolveConversationReadScope(ctx);
  if (scope.mode === "none") {
    throw new PermissionDeniedError(CONVERSATION_PERMISSIONS.viewAssigned);
  }
  return scope;
}

/**
 * Whether a concrete conversation row is visible under the resolved scope.
 *
 * View Assigned:
 *   assigned_user_id = actor
 *   OR (assigned_user_id IS NULL AND department_id = actor.department_id)
 *   OR department_id IN managedDepartmentIds
 *
 * NULL department ownership never enters a department queue / manager scope.
 */
export function isConversationVisibleToScope(
  conversation: Pick<ConversationRecord, "assigned_user_id" | "department_id">,
  scope: ConversationReadScope,
): boolean {
  if (scope.mode === "all") return true;
  if (scope.mode === "none") return false;

  if (conversation.assigned_user_id === scope.userId) {
    return true;
  }

  const conversationDepartmentId = normalizeId(conversation.department_id);
  if (
    conversationDepartmentId &&
    scope.managedDepartmentIds.includes(conversationDepartmentId)
  ) {
    return true;
  }

  if (
    conversation.assigned_user_id == null &&
    scope.departmentId != null &&
    conversationDepartmentId === scope.departmentId
  ) {
    return true;
  }

  return false;
}

/**
 * Assert a loaded conversation is readable. Uses NotFound when out of assignee
 * / department scope so IDs are not confirmed to assigned-only callers.
 */
export function assertConversationReadable(
  ctx: ServiceContext,
  conversation: ConversationRecord,
): void {
  const scope = assertCanReadConversations(ctx);
  if (!isConversationVisibleToScope(conversation, scope)) {
    throw new ConversationNotFoundError(conversation.id);
  }
}

/**
 * Apply View Assigned visibility constraint for list filters.
 * Callers cannot widen scope by omitting or spoofing assignedUserId.
 * Department queue + manager visibility are expressed via visibilityConstraint
 * (OR predicate), not by forcing assignedUserId alone.
 */
export function applyConversationListVisibilityFilter(
  filter: ListConversationsFilter,
  scope: ConversationReadScope,
): ListConversationsFilter {
  if (scope.mode !== "assigned") {
    if (filter.visibilityConstraint == null) return filter;
    const { visibilityConstraint: _dropped, ...rest } = filter;
    return rest;
  }

  let assignedUserId = filter.assignedUserId;
  if (typeof assignedUserId === "string" && assignedUserId.trim() !== scope.userId) {
    // Spoofed assignee filter → force self (cannot list another user's inbox).
    assignedUserId = scope.userId;
  }

  return {
    ...filter,
    assignedUserId,
    visibilityConstraint: {
      userId: scope.userId,
      departmentId: scope.departmentId,
      managedDepartmentIds: [...scope.managedDepartmentIds],
    },
  };
}
