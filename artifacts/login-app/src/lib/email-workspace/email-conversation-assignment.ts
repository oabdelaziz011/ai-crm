import {
  CONVERSATION_PERMISSIONS,
  type ConversationRecord,
  type ConversationState,
  type ServiceContext,
} from "@workspace/ai-conversation";
import type { EmployeeIdentity } from "@/lib/employee-identity/types";

/** Canonical write permission for ConversationService.assignConversation. */
export const EMAIL_CONVERSATION_ASSIGN_PERMISSION = CONVERSATION_PERMISSIONS.takeover;
/** Canonical unassign permission for ConversationService.releaseConversation. */
export const EMAIL_CONVERSATION_RELEASE_PERMISSION = CONVERSATION_PERMISSIONS.release;
/** Lifecycle alias that maps to ai.conversations.takeover. */
export const EMAIL_CONVERSATION_ASSIGN_ALIAS = "conversation.assign";

export const EMAIL_CONVERSATION_UNASSIGNED_VALUE = "__unassigned__";

export type EmailConversationAssignmentAccess = {
  isSuperAdmin?: boolean;
  hasPermission: (permission: string) => boolean;
};

export type EmailConversationAssignmentService = {
  assignConversation: (
    ctx: ServiceContext,
    input: { conversationId: string; assignedUserId: string; state?: ConversationState },
  ) => Promise<ConversationRecord>;
  releaseConversation: (
    ctx: ServiceContext,
    input: { conversationId: string; state?: ConversationState },
  ) => Promise<ConversationRecord>;
};

export type EmailConversationAssigneeOption = {
  value: string;
  label: string;
  description?: string;
};

/**
 * UI gate for the Email Workspace assignee control.
 * Backend ConversationService.assignConversation remains authoritative
 * (ai.conversations.takeover / super-admin).
 */
export function canAssignEmailConversation(access: EmailConversationAssignmentAccess): boolean {
  if (access.isSuperAdmin) return true;
  return (
    access.hasPermission(EMAIL_CONVERSATION_ASSIGN_PERMISSION) ||
    access.hasPermission(EMAIL_CONVERSATION_ASSIGN_ALIAS)
  );
}

/** conversations.assigned_user_id is auth.uid() — never a profiles.id. */
export function resolveEmailConversationAssigneeUserId(
  employee: Pick<EmployeeIdentity, "id" | "userId">,
): string | null {
  const userId = employee.userId?.trim();
  return userId || null;
}

export function findEmailConversationAssignee<
  T extends Pick<EmployeeIdentity, "id" | "userId" | "fullName">,
>(employees: readonly T[], assignedUserId: string | null | undefined): T | null {
  const id = assignedUserId?.trim();
  if (!id) return null;
  return employees.find((employee) => employee.userId === id || employee.id === id) ?? null;
}

export function emailConversationAssigneeLabel(
  assignedUserId: string | null | undefined,
  employeeName: string | null | undefined,
  unassignedLabel: string,
): string {
  if (!assignedUserId?.trim()) return unassignedLabel;
  const name = employeeName?.trim();
  return name || assignedUserId.trim();
}

export function listAssignableEmailEmployees(
  employees: readonly EmployeeIdentity[],
  currentAssignedUserId: string | null | undefined,
): EmployeeIdentity[] {
  const current = currentAssignedUserId?.trim() || null;
  const seen = new Set<string>();
  const out: EmployeeIdentity[] = [];
  for (const employee of employees) {
    const userId = resolveEmailConversationAssigneeUserId(employee);
    if (!userId) continue;
    const isCurrent = userId === current || employee.id === current;
    if (employee.status !== "active" && !isCurrent) continue;
    if (seen.has(userId)) continue;
    seen.add(userId);
    out.push(employee);
  }
  return out;
}

export function buildEmailConversationAssigneeSelectOptions(input: {
  employees: readonly EmployeeIdentity[];
  assignedUserId: string | null | undefined;
  assignedLabel?: string | null;
  unassignedLabel: string;
}): EmailConversationAssigneeOption[] {
  const options: EmailConversationAssigneeOption[] = [
    { value: EMAIL_CONVERSATION_UNASSIGNED_VALUE, label: input.unassignedLabel },
  ];
  const assignable = listAssignableEmailEmployees(input.employees, input.assignedUserId);
  const seen = new Set<string>([EMAIL_CONVERSATION_UNASSIGNED_VALUE]);
  for (const employee of assignable) {
    const userId = resolveEmailConversationAssigneeUserId(employee);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    options.push({
      value: userId,
      label: employee.fullName,
      description: employee.email ?? undefined,
    });
  }
  const current = input.assignedUserId?.trim();
  if (current && !seen.has(current)) {
    options.push({
      value: current,
      label: input.assignedLabel?.trim() || current,
    });
  }
  return options;
}

export function selectValueForEmailConversationAssignee(
  assignedUserId: string | null | undefined,
): string {
  return assignedUserId?.trim() || EMAIL_CONVERSATION_UNASSIGNED_VALUE;
}

export function assignedUserIdFromEmailConversationSelectValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === EMAIL_CONVERSATION_UNASSIGNED_VALUE) return null;
  return trimmed;
}

export function patchConversationAssigneeInList<T extends { id: string; assigned_user_id: string | null }>(
  rows: readonly T[],
  conversationId: string,
  assignedUserId: string | null,
): T[] {
  return rows.map((row) =>
    row.id === conversationId ? { ...row, assigned_user_id: assignedUserId } : row,
  );
}

/** In-place cache patch — preserves inbox order (no sort / no refetch). */
export function patchConversationAssigneeCacheData(
  data: unknown,
  conversationId: string,
  assignedUserId: string | null,
): unknown {
  if (Array.isArray(data)) {
    return patchConversationAssigneeInList(
      data as Array<{ id: string; assigned_user_id: string | null }>,
      conversationId,
      assignedUserId,
    );
  }
  if (data && typeof data === "object" && "pages" in data) {
    const record = data as { pages: unknown };
    if (Array.isArray(record.pages)) {
      return {
        ...record,
        pages: record.pages.map((page) => {
          if (!page || typeof page !== "object" || !("rows" in page)) return page;
          const rows = (page as { rows: unknown }).rows;
          if (!Array.isArray(rows)) return page;
          return {
            ...page,
            rows: patchConversationAssigneeInList(
              rows as Array<{ id: string; assigned_user_id: string | null }>,
              conversationId,
              assignedUserId,
            ),
          };
        }),
      };
    }
  }
  if (data && typeof data === "object" && "id" in data) {
    const row = data as { id: unknown; assigned_user_id?: string | null };
    if (row.id === conversationId) {
      return { ...row, assigned_user_id: assignedUserId };
    }
  }
  return data;
}

export function isEmailConversationAssignable(
  conversation: Pick<ConversationRecord, "id" | "deleted_at"> | null | undefined,
): boolean {
  if (!conversation?.id) return false;
  return conversation.deleted_at == null;
}

/**
 * Persist Email Workspace ownership via the existing conversation assignment
 * service. Linked support ticket assignee sync (when a ticket exists) is handled
 * inside ConversationService after governance succeeds — not in this helper.
 *
 * Employee → assignConversation (takeover + Assignment Governance).
 * Unassigned / null → releaseConversation (release).
 * Current conversation state is always passed so email lifecycle is not forced
 * to transferred_to_human / waiting_user.
 */
export async function persistEmailConversationAssignee(input: {
  services: EmailConversationAssignmentService;
  context: ServiceContext;
  conversation: Pick<ConversationRecord, "id" | "state" | "deleted_at">;
  assignedUserId: string | null;
}): Promise<ConversationRecord> {
  if (!isEmailConversationAssignable(input.conversation)) {
    throw new Error("CONVERSATION_UNAVAILABLE");
  }
  const state = input.conversation.state;
  const assignedUserId = input.assignedUserId?.trim() || null;
  if (assignedUserId) {
    return input.services.assignConversation(input.context, {
      conversationId: input.conversation.id,
      assignedUserId,
      state,
    });
  }
  return input.services.releaseConversation(input.context, {
    conversationId: input.conversation.id,
    state,
  });
}
