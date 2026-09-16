import type { IntelligentSuggestedReply } from "@/lib/omnichannel/types/suggested-reply-types";

export type QuickRepliesSessionState = {
  conversationId: string | null;
  suggestions: IntelligentSuggestedReply[];
  variantOffset: number;
  contextFingerprint: string;
  loading: boolean;
  error: string | null;
};

export function fingerprintSuggestionContext(input: {
  conversationId: string | null | undefined;
  lastCustomerMessage?: string | null;
  targetLanguage?: string | null;
  intent?: string | null;
}): string {
  return [
    input.conversationId?.trim() || "",
    (input.lastCustomerMessage ?? "").trim().slice(0, 160),
    input.targetLanguage ?? "",
    input.intent ?? "",
  ].join("|");
}

export function createQuickRepliesSession(
  conversationId: string | null,
  suggestions: IntelligentSuggestedReply[],
  contextFingerprint = "",
): QuickRepliesSessionState {
  return {
    conversationId,
    suggestions,
    variantOffset: 0,
    contextFingerprint,
    loading: false,
    error: null,
  };
}

/**
 * Keep cached suggestions when the same conversation + context is reopened.
 * Reset when conversation changes or context materially changes.
 */
export function reconcileQuickRepliesSession(input: {
  prev: QuickRepliesSessionState;
  conversationId: string | null;
  incomingSuggestions: IntelligentSuggestedReply[];
  contextFingerprint: string;
}): QuickRepliesSessionState {
  if (input.prev.conversationId !== input.conversationId) {
    return createQuickRepliesSession(
      input.conversationId,
      input.incomingSuggestions,
      input.contextFingerprint,
    );
  }
  if (input.prev.contextFingerprint !== input.contextFingerprint) {
    return {
      ...createQuickRepliesSession(
        input.conversationId,
        input.incomingSuggestions,
        input.contextFingerprint,
      ),
      // Preserve refresh offset only within same conversation; reset for new context.
      variantOffset: 0,
    };
  }
  // Same conversation + context: keep local refresh result if present.
  if (input.prev.suggestions.length > 0 && input.prev.variantOffset > 0) {
    return { ...input.prev, error: null };
  }
  return {
    ...input.prev,
    suggestions: input.incomingSuggestions,
    error: null,
  };
}

export function beginQuickRepliesRefresh(
  prev: QuickRepliesSessionState,
): QuickRepliesSessionState | null {
  if (prev.loading) return null;
  return { ...prev, loading: true, error: null };
}

export function completeQuickRepliesRefresh(input: {
  prev: QuickRepliesSessionState;
  conversationId: string | null;
  suggestions: IntelligentSuggestedReply[];
  variantOffset: number;
  error?: string | null;
}): QuickRepliesSessionState {
  // Ignore stale completion after conversation switch.
  if (input.prev.conversationId !== input.conversationId) {
    return input.prev;
  }
  return {
    ...input.prev,
    suggestions: input.error ? input.prev.suggestions : input.suggestions,
    variantOffset: input.variantOffset,
    loading: false,
    error: input.error ?? null,
  };
}

export function isSuggestionSetDifferent(
  left: IntelligentSuggestedReply[],
  right: IntelligentSuggestedReply[],
): boolean {
  if (left.length !== right.length) return true;
  return left.some((item, index) => item.text !== right[index]?.text || item.id !== right[index]?.id);
}
