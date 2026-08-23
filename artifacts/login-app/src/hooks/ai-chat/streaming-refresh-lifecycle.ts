type DisplayChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  pending?: boolean;
  streaming?: boolean;
};

/** Synthetic assistant bubble shown between routeInbound and DB refetch. */
export const TURN_ASSISTANT_PENDING_ID = "turn-assistant-pending";

/**
 * Phase 5Q.2 — Duplicate assistant bubble root cause:
 * After routeInbound persists the assistant message, refreshMessages() loads it while
 * isSending && streamingContent are still true. AiChatMessageList then renders both the
 * DB bubble and the streaming bubble for the same turn.
 *
 * Only clear streaming once the assistant reply is visible via route response or persistence.
 */
export function shouldClearStreamingBeforeRefresh(params: {
  isSending: boolean;
  hasStreamingContent: boolean;
  hasRenderableAssistantResponse: boolean;
}): boolean {
  if (!params.isSending || !params.hasStreamingContent) return false;
  return params.hasRenderableAssistantResponse;
}

export function shouldShowSyntheticWelcome(params: {
  loaded: DisplayChatMessage[];
  welcomeMessage: string;
  suppressSyntheticWelcome: boolean;
}): boolean {
  if (params.suppressSyntheticWelcome) return false;
  if (params.loaded.length > 0) return false;
  return Boolean(params.welcomeMessage.trim());
}

export function lastOutgoingAssistantContent(messages: DisplayChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      return message.content.trim();
    }
  }
  return null;
}

export function hasPersistedOutgoingForPending(
  loaded: DisplayChatMessage[],
  pendingContent: string,
): boolean {
  const trimmed = pendingContent.trim();
  if (!trimmed) return true;
  return lastOutgoingAssistantContent(loaded) === trimmed;
}

export function appendPendingAssistantIfNeeded(
  messages: DisplayChatMessage[],
  pendingContent: string | null,
): DisplayChatMessage[] {
  const trimmed = pendingContent?.trim() ?? "";
  if (!trimmed) return messages;
  if (hasPersistedOutgoingForPending(messages, trimmed)) return messages;

  const last = messages[messages.length - 1];
  if (last?.role === "assistant" && last.content.trim() === trimmed) {
    return messages;
  }

  return [
    ...messages,
    {
      id: TURN_ASSISTANT_PENDING_ID,
      role: "assistant",
      content: trimmed,
      createdAt: new Date().toISOString(),
      pending: true,
    },
  ];
}

export function buildDisplayMessages(params: {
  loaded: DisplayChatMessage[];
  welcomeMessage: string;
  suppressSyntheticWelcome: boolean;
  pendingAssistantContent: string | null;
}): DisplayChatMessage[] {
  if (shouldShowSyntheticWelcome(params)) {
    return [
      {
        id: "welcome",
        role: "assistant",
        content: params.welcomeMessage.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return appendPendingAssistantIfNeeded(params.loaded, params.pendingAssistantContent);
}
