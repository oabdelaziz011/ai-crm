import { CONVERSATION_PERMISSIONS } from "@workspace/ai-conversation";
import type { LifecycleAction, LifecyclePermissionContext, LifecycleRole } from "../types/lifecycle-types.js";

/** Canonical enterprise conversation permissions (Sprint 9.2.1). */
export const CONVERSATION_LIFECYCLE_PERMISSIONS = {
  view: "conversation.view",
  reply: "conversation.reply",
  assign: "conversation.assign",
  reassign: "conversation.reassign",
  takeOver: "conversation.take_over",
  returnToAi: "conversation.return_to_ai",
  escalate: "conversation.escalate",
  resolve: "conversation.resolve",
  close: "conversation.close",
  reopen: "conversation.reopen",
  internalNote: "conversation.internal_note",
  linkCustomer: "conversation.link_customer",
  createCustomer: "conversation.create_customer",
} as const;

/** Legacy aliases retained for backward compatibility during migration. */
export const LEGACY_CONVERSATION_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  [CONVERSATION_LIFECYCLE_PERMISSIONS.view]: [CONVERSATION_PERMISSIONS.view],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.reply]: [CONVERSATION_PERMISSIONS.reply],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.assign]: [CONVERSATION_PERMISSIONS.takeover],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.reassign]: ["ai.conversations.reassign"],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.takeOver]: [CONVERSATION_PERMISSIONS.takeover],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.returnToAi]: [CONVERSATION_PERMISSIONS.release],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.escalate]: ["ai.conversations.escalate", CONVERSATION_PERMISSIONS.takeover],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.resolve]: [CONVERSATION_LIFECYCLE_PERMISSIONS.close],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.close]: [CONVERSATION_PERMISSIONS.reply],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.reopen]: [CONVERSATION_LIFECYCLE_PERMISSIONS.close],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.internalNote]: [CONVERSATION_PERMISSIONS.reply],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.linkCustomer]: ["customers.edit"],
  [CONVERSATION_LIFECYCLE_PERMISSIONS.createCustomer]: ["customers.create"],
};

/** @deprecated Use CONVERSATION_LIFECYCLE_PERMISSIONS */
export const LIFECYCLE_PERMISSION_CODES = {
  view: CONVERSATION_LIFECYCLE_PERMISSIONS.view,
  reply: CONVERSATION_LIFECYCLE_PERMISSIONS.reply,
  takeover: CONVERSATION_LIFECYCLE_PERMISSIONS.takeOver,
  release: CONVERSATION_LIFECYCLE_PERMISSIONS.returnToAi,
  escalate: CONVERSATION_LIFECYCLE_PERMISSIONS.escalate,
  reassign: CONVERSATION_LIFECYCLE_PERMISSIONS.reassign,
  bulkAssign: "ai.conversations.bulk_assign",
  manageQueues: "ai.conversations.manage_queues",
  viewInternalNotes: CONVERSATION_LIFECYCLE_PERMISSIONS.internalNote,
  closeAny: "ai.conversations.close_any",
} as const;

const ACTION_PERMISSION_MAP: Partial<Record<LifecycleAction, string>> = {
  reply: CONVERSATION_LIFECYCLE_PERMISSIONS.reply,
  internal_note: CONVERSATION_LIFECYCLE_PERMISSIONS.internalNote,
  take_over: CONVERSATION_LIFECYCLE_PERMISSIONS.takeOver,
  assign: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  reassign: CONVERSATION_LIFECYCLE_PERMISSIONS.reassign,
  accept: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  reject: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  transfer: CONVERSATION_LIFECYCLE_PERMISSIONS.reassign,
  bulk_assign: "ai.conversations.bulk_assign",
  auto_assign: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  round_robin_assign: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  skills_assign: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  queue_assign: CONVERSATION_LIFECYCLE_PERMISSIONS.assign,
  return_to_ai: CONVERSATION_LIFECYCLE_PERMISSIONS.returnToAi,
  ai_release: CONVERSATION_LIFECYCLE_PERMISSIONS.returnToAi,
  escalate: CONVERSATION_LIFECYCLE_PERMISSIONS.escalate,
  return: CONVERSATION_LIFECYCLE_PERMISSIONS.escalate,
  escalation_accept: CONVERSATION_LIFECYCLE_PERMISSIONS.escalate,
  escalation_cancel: CONVERSATION_LIFECYCLE_PERMISSIONS.escalate,
  resolve: CONVERSATION_LIFECYCLE_PERMISSIONS.resolve,
  close: CONVERSATION_LIFECYCLE_PERMISSIONS.close,
  reopen: CONVERSATION_LIFECYCLE_PERMISSIONS.reopen,
};

const ROLE_ACTION_MATRIX: Record<LifecycleRole, readonly LifecycleAction[]> = {
  admin: [
    "take_over", "assign", "reassign", "accept", "reject", "transfer", "bulk_assign",
    "auto_assign", "round_robin_assign", "skills_assign", "queue_assign", "close", "reply",
    "internal_note", "return_to_ai", "escalate", "return", "resolve", "reopen",
    "escalation_accept", "escalation_cancel", "ai_own", "ai_release", "ai_request_human",
    "ai_resume", "ai_return", "ai_escalate",
  ],
  manager: [
    "take_over", "assign", "reassign", "transfer", "bulk_assign", "auto_assign",
    "round_robin_assign", "skills_assign", "queue_assign", "close", "reply",
    "internal_note", "return_to_ai", "escalate", "return", "resolve", "reopen",
    "escalation_accept", "escalation_cancel",
  ],
  supervisor: [
    "take_over", "assign", "reassign", "transfer", "close", "reply", "internal_note",
    "return_to_ai", "escalate", "return", "resolve", "reopen", "escalation_accept",
  ],
  agent: [
    "take_over", "assign", "reply", "internal_note", "return_to_ai", "escalate",
    "resolve", "close", "reopen",
  ],
  ai_employee: [
    "ai_own", "ai_release", "ai_request_human", "ai_resume", "ai_return", "ai_escalate", "reply",
  ],
};

function hasPermissionCode(
  ctx: LifecyclePermissionContext,
  code: string,
): boolean {
  if (ctx.isSuperAdmin) return true;
  if (ctx.hasPermission(code)) return true;
  const aliases = LEGACY_CONVERSATION_PERMISSION_ALIASES[code] ?? [];
  return aliases.some((alias) => ctx.hasPermission(alias));
}

export function permissionForLifecycleAction(action: LifecycleAction): string | null {
  return ACTION_PERMISSION_MAP[action] ?? null;
}

export function canPerformLifecycleAction(
  ctx: LifecyclePermissionContext,
  action: LifecycleAction,
): boolean {
  if (ctx.role === "ai_employee") {
    return ROLE_ACTION_MATRIX.ai_employee.includes(action) && ctx.isAiParticipant === true;
  }

  const roleAllowed = ROLE_ACTION_MATRIX[ctx.role]?.includes(action) ?? false;
  if (!roleAllowed) return false;

  const permission = permissionForLifecycleAction(action);
  if (!permission) return false;

  if (
    (action === "take_over" || action === "assign")
    && ctx.isAssignedAgent
    && hasPermissionCode(ctx, CONVERSATION_LIFECYCLE_PERMISSIONS.reply)
  ) {
    return true;
  }

  if (action === "close" && ctx.isAssignedAgent) {
    return hasPermissionCode(ctx, CONVERSATION_LIFECYCLE_PERMISSIONS.close);
  }

  return hasPermissionCode(ctx, permission);
}

export function canLinkCustomer(ctx: LifecyclePermissionContext): boolean {
  return hasPermissionCode(ctx, CONVERSATION_LIFECYCLE_PERMISSIONS.linkCustomer);
}

export function canCreateCustomer(ctx: LifecyclePermissionContext): boolean {
  return hasPermissionCode(ctx, CONVERSATION_LIFECYCLE_PERMISSIONS.createCustomer);
}

export function filterAllowedActionsForRole(
  ctx: LifecyclePermissionContext,
  actions: readonly LifecycleAction[],
): LifecycleAction[] {
  return actions.filter((action) => canPerformLifecycleAction(ctx, action));
}

export function buildPermissionMatrix(): Record<
  LifecycleRole,
  { actions: readonly LifecycleAction[]; permissions: string[] }
> {
  const roles = Object.keys(ROLE_ACTION_MATRIX) as LifecycleRole[];
  return Object.fromEntries(
    roles.map((role) => [
      role,
      {
        actions: ROLE_ACTION_MATRIX[role],
        permissions: [
          ...new Set(
            ROLE_ACTION_MATRIX[role]
              .map((action) => permissionForLifecycleAction(action))
              .filter((code): code is string => code != null),
          ),
        ],
      },
    ]),
  ) as Record<LifecycleRole, { actions: readonly LifecycleAction[]; permissions: string[] }>;
}

export function inferLifecycleRole(
  ctx: Pick<LifecyclePermissionContext, "isSuperAdmin" | "hasPermission" | "isAiParticipant">,
): LifecycleRole {
  if (ctx.isAiParticipant) return "ai_employee";
  if (ctx.isSuperAdmin) return "admin";
  if (ctx.hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.reassign)) return "supervisor";
  if (ctx.hasPermission("ai.conversations.bulk_assign")) return "manager";
  if (ctx.hasPermission(CONVERSATION_LIFECYCLE_PERMISSIONS.assign)) return "agent";
  return "agent";
}
