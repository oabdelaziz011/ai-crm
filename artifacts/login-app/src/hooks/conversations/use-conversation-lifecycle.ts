import { useMemo } from "react";
import type { ConversationRecord } from "@workspace/ai-conversation";
import {
  conversationLifecycleCoordinator,
  type LifecyclePermissionContext,
  type LifecycleSnapshot,
} from "@/lib/conversation-lifecycle";
import type { AssignmentTargetType } from "@/lib/conversation-lifecycle";

export type UseConversationLifecycleInput = {
  record: ConversationRecord | null | undefined;
  operationalAssignment?: {
    targetType: AssignmentTargetType;
    targetId: string;
    targetLabel: string;
  } | null;
  activeQueueId?: string | null;
  permissionContext?: LifecyclePermissionContext;
};

/**
 * Read-only lifecycle projection hook.
 * Additive API for future UI — existing omnichannel components unchanged.
 */
export function useConversationLifecycle(
  input: UseConversationLifecycleInput,
): LifecycleSnapshot | null {
  return useMemo(() => {
    if (!input.record) return null;
    return conversationLifecycleCoordinator.snapshot({
      record: input.record,
      operationalAssignment: input.operationalAssignment,
      activeQueueId: input.activeQueueId,
      permissionContext: input.permissionContext,
    });
  }, [
    input.record,
    input.operationalAssignment,
    input.activeQueueId,
    input.permissionContext,
  ]);
}

export function useLifecycleActionValidation(
  input: UseConversationLifecycleInput,
  action: Parameters<typeof conversationLifecycleCoordinator.validateAction>[1] | null,
) {
  return useMemo(() => {
    if (!input.record || !action) return null;
    return conversationLifecycleCoordinator.validateAction(
      { record: input.record, operationalAssignment: input.operationalAssignment },
      action,
    );
  }, [input.record, input.operationalAssignment, action]);
}
