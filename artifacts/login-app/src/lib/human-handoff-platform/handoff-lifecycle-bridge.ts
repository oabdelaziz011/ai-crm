import type { LifecycleAction } from "@/lib/conversation-lifecycle/types/lifecycle-types";
import type { EscalationTrigger, HandoffPlatformServices, HandoffServiceContext } from "@workspace/human-handoff-platform";

export type HandoffLifecycleBridgeInput = {
  action: LifecycleAction;
  companyId: string;
  conversationId: string;
  actorUserId: string | null;
  assigneeUserId?: string | null;
  queueId?: string | null;
  reason?: string;
  escalationTrigger?: EscalationTrigger;
  aiAssistantId?: string | null;
};

const HANDOFF_ACTIONS = new Set<LifecycleAction>([
  "transfer",
  "assign",
  "reassign",
  "take_over",
  "accept",
  "reject",
  "return_to_ai",
  "ai_request_human",
  "ai_return",
  "ai_escalate",
  "escalate",
  "queue_enqueue",
  "close",
]);

export function isHandoffLifecycleAction(action: LifecycleAction): boolean {
  return HANDOFF_ACTIONS.has(action);
}

/**
 * Delegates lifecycle handoff mutations to Human Handoff Platform.
 * Lifecycle overlay metadata remains in conversation-lifecycle; ownership of record transitions lives here.
 */
export async function executeHandoffLifecycleBridge(
  platform: HandoffPlatformServices,
  ctx: HandoffServiceContext,
  input: HandoffLifecycleBridgeInput,
): Promise<void> {
  if (!isHandoffLifecycleAction(input.action)) return;

  const base = {
    companyId: input.companyId,
    conversationId: input.conversationId,
    reason: input.reason,
  };

  switch (input.action) {
    case "transfer":
      if (input.queueId) {
        await platform.commands.queueConversation(ctx, { ...base, queueId: input.queueId });
        return;
      }
      if (input.assigneeUserId) {
        await platform.commands.transferConversation(ctx, {
          ...base,
          toUserId: input.assigneeUserId,
        });
      }
      return;

    case "assign":
    case "reassign":
    case "take_over":
      if (input.assigneeUserId) {
        await platform.commands.assignConversation(ctx, {
          ...base,
          assigneeUserId: input.assigneeUserId,
        });
      }
      return;

    case "accept":
    case "escalation_accept":
      await platform.commands.acceptConversation(ctx, base);
      return;

    case "reject":
      await platform.commands.rejectConversation(ctx, base);
      return;

    case "return_to_ai":
    case "ai_return":
      await platform.commands.returnConversationToAi(ctx, base);
      return;

    case "ai_request_human":
    case "queue_enqueue":
      if (input.queueId) {
        await platform.commands.queueConversation(ctx, {
          ...base,
          queueId: input.queueId,
          requestedByAiAssistantId: input.aiAssistantId ?? undefined,
        });
      } else {
        await platform.commands.escalateConversation(ctx, {
          ...base,
          triggerCode: input.escalationTrigger ?? "customer_requested",
          requestedByAiAssistantId: input.aiAssistantId ?? undefined,
        });
      }
      return;

    case "escalate":
    case "ai_escalate":
      await platform.commands.escalateConversation(ctx, {
        ...base,
        triggerCode: input.escalationTrigger ?? "manual",
        targetQueueId: input.queueId ?? undefined,
        requestedByAiAssistantId: input.aiAssistantId ?? undefined,
      });
      return;

    case "close":
      await platform.commands.closeConversation(ctx, base);
      return;

    default:
      return;
  }
}
