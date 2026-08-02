import type { ServiceContext } from "@workspace/ai-conversation";
import type { ConversationRecord } from "@workspace/ai-conversation";
import type { createConversationServices } from "@workspace/ai-conversation";
import type { BackendActionHint } from "../adapters/backend-state-adapter.js";
import type { LifecycleAction } from "../types/lifecycle-types.js";

type ConversationServices = ReturnType<typeof createConversationServices>;

export type ExecuteBackendHintInput = {
  conversationId: string;
  action: LifecycleAction;
  hint: BackendActionHint | null;
  assignedUserId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Single gateway for backend API calls triggered by lifecycle transitions.
 * UI and hooks must not invoke conversation services directly for lifecycle actions.
 */
export async function executeBackendLifecycleHint(
  services: ConversationServices,
  ctx: ServiceContext,
  input: ExecuteBackendHintInput,
): Promise<void> {
  const hint = input.hint;
  const assignActions = new Set<LifecycleAction>(["assign", "reassign", "take_over", "transfer"]);
  const assignedUserId = input.assignedUserId ?? null;

  if (assignedUserId && assignActions.has(input.action)) {
    await services.conversations.assignConversation(ctx, {
      conversationId: input.conversationId,
      assignedUserId,
    });
  }

  if (!hint || hint.kind === "none") {
    if (input.action === "reopen") {
      await services.conversations.updateState(ctx, {
        conversationId: input.conversationId,
        state: "waiting_user",
      });
    }
    return;
  }

  switch (hint.kind) {
    case "assign": {
      if (assignedUserId) return;
      const userId = hint.assignedUserId;
      if (!userId) return;
      await services.conversations.assignConversation(ctx, {
        conversationId: input.conversationId,
        assignedUserId: userId,
      });
      return;
    }
    case "release":
      await services.conversations.releaseConversation(ctx, {
        conversationId: input.conversationId,
      });
      return;
    case "close":
      await services.conversations.closeConversation(ctx, {
        conversationId: input.conversationId,
      });
      return;
    case "update_metadata":
      if (input.metadata) {
        await services.conversations.updateMetadata(ctx, {
          conversationId: input.conversationId,
          metadata: input.metadata,
        });
      }
      return;
    case "add_message":
      return;
  }

  if (input.action === "reopen") {
    await services.conversations.updateState(ctx, {
      conversationId: input.conversationId,
      state: "waiting_user",
    });
  }
}

export async function persistLifecycleMetadata(
  services: ConversationServices,
  ctx: ServiceContext,
  conversationId: string,
  metadata: Record<string, unknown>,
): Promise<ConversationRecord> {
  return services.conversations.updateMetadata(ctx, { conversationId, metadata });
}

export async function linkCustomerViaBackend(
  services: ConversationServices,
  ctx: ServiceContext,
  input: {
    conversationId: string;
    customerId: string;
    companyId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const { linkCustomerToConversation } = await import("../integration/conversation-customer-link.js");
  await linkCustomerToConversation({
    conversationId: input.conversationId,
    customerId: input.customerId,
    companyId: input.companyId,
  });
  await persistLifecycleMetadata(services, ctx, input.conversationId, input.metadata);
}
