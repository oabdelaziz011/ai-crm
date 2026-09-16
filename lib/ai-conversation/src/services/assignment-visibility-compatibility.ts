/**
 * Phase 6D Step 3 — Assignment visibility compatibility.
 *
 * Separate from Assignment Governance (actor → target eligibility).
 * Answers: will the TARGET be able to read this conversation AFTER assignment?
 *
 * Does NOT mutate the database. Simulates assigned_user_id = targetUserId
 * while keeping conversations.department_id unchanged.
 */

import { AssignmentTargetCannotReadConversationError } from "../errors.js";
import type { ConversationRecord, ServiceContext } from "../types.js";
import {
  isConversationVisibleToScope,
  resolveConversationReadScope,
} from "./conversation-visibility.js";

export type AssignmentTargetVisibilitySnapshot = {
  userId: string;
  companyId: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  departmentId: string | null;
  managedDepartmentIds: readonly string[];
  /** Authoritative permission codes for the target (never client-supplied). */
  permissionCodes: ReadonlySet<string>;
};

/**
 * Authoritative loader for target visibility inputs.
 * Must not trust request-body permission/department/super-admin flags.
 */
export type AssignmentTargetVisibilityPort = {
  loadTargetVisibilitySnapshot(input: {
    targetUserId: string;
    companyId: string;
  }): Promise<AssignmentTargetVisibilitySnapshot | null>;
};

export type CanTargetReadConversationAfterAssignmentInput = {
  conversation: Pick<ConversationRecord, "company_id" | "assigned_user_id" | "department_id">;
  target: AssignmentTargetVisibilitySnapshot;
  targetUserId: string;
};

/**
 * Pure post-assignment visibility simulation using Step 2 semantics.
 * Does not consult the actor's ServiceContext.
 */
export function canTargetReadConversationAfterAssignment(
  input: CanTargetReadConversationAfterAssignmentInput,
): boolean {
  const targetUserId = input.targetUserId.trim();
  if (!targetUserId || input.target.userId.trim() !== targetUserId) {
    return false;
  }

  if (!input.target.isActive) {
    return false;
  }

  const conversationCompanyId = input.conversation.company_id?.trim() || "";
  const targetCompanyId = input.target.companyId?.trim() || "";
  if (!conversationCompanyId || !targetCompanyId || conversationCompanyId !== targetCompanyId) {
    return false;
  }

  const targetCtx: ServiceContext = {
    userId: targetUserId,
    companyId: targetCompanyId,
    isSuperAdmin: input.target.isSuperAdmin === true,
    hasPermission: (code) => input.target.permissionCodes.has(code),
    departmentId: input.target.departmentId,
    managedDepartmentIds: [...input.target.managedDepartmentIds],
  };

  const scope = resolveConversationReadScope(targetCtx);
  if (scope.mode === "none") {
    return false;
  }

  // Simulate post-assignment assignee; durable department ownership unchanged.
  const postAssignment = {
    assigned_user_id: targetUserId,
    department_id: input.conversation.department_id,
  };

  return isConversationVisibleToScope(postAssignment, scope);
}

/**
 * Fail-closed assert used by ConversationService.assignConversation.
 * Throws a dedicated domain error without leaking target permission details.
 */
export async function assertAssignmentVisibilityCompatibility(input: {
  conversation: ConversationRecord;
  targetUserId: string;
  companyId: string;
  port: AssignmentTargetVisibilityPort;
}): Promise<void> {
  const targetUserId = input.targetUserId.trim();
  const companyId = input.companyId.trim();
  if (!targetUserId || !companyId) {
    throw new AssignmentTargetCannotReadConversationError();
  }

  if (input.conversation.company_id !== companyId) {
    throw new AssignmentTargetCannotReadConversationError();
  }

  const target = await input.port.loadTargetVisibilitySnapshot({
    targetUserId,
    companyId,
  });

  if (!target) {
    throw new AssignmentTargetCannotReadConversationError();
  }

  const ok = canTargetReadConversationAfterAssignment({
    conversation: input.conversation,
    target,
    targetUserId,
  });

  if (!ok) {
    throw new AssignmentTargetCannotReadConversationError();
  }
}

/** Test helper: build a snapshot with conversation permission codes. */
export function buildTargetVisibilitySnapshot(partial: {
  userId: string;
  companyId: string | null;
  isActive?: boolean;
  isSuperAdmin?: boolean;
  departmentId?: string | null;
  managedDepartmentIds?: readonly string[];
  permissions?: readonly string[];
}): AssignmentTargetVisibilitySnapshot {
  return {
    userId: partial.userId,
    companyId: partial.companyId,
    isActive: partial.isActive ?? true,
    isSuperAdmin: partial.isSuperAdmin ?? false,
    departmentId: partial.departmentId ?? null,
    managedDepartmentIds: partial.managedDepartmentIds ?? [],
    permissionCodes: new Set(partial.permissions ?? []),
  };
}
