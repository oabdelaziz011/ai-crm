/**
 * Conversation-scoped runtime variables persisted on automation runs.
 *
 * Interactive message nodes (buttons, lists) write into this namespace on resume.
 * Condition nodes resolve `conversation.*` fields via `resolveFieldValue`.
 */
export const INTERACTIVE_SELECTION_INPUT_KEY = "interactive_selection";

export const INTERACTION_SELECTION_TYPES = ["button", "list", "flow", "quick_reply"] as const;

export type InteractionSelectionType = (typeof INTERACTION_SELECTION_TYPES)[number];

const INTERACTION_TYPE_ALIASES: Record<string, InteractionSelectionType> = {
  button: "button",
  buttons: "button",
  button_reply: "button",
  send_buttons: "button",
  list: "list",
  list_reply: "list",
  send_list: "list",
  flow: "flow",
  quick_reply: "quick_reply",
  quickreply: "quick_reply",
};

/** Canonical mapper for every inbound interaction-type hint. */
export function normalizeInteractionType(value: unknown): InteractionSelectionType | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return INTERACTION_TYPE_ALIASES[normalized];
}

export type ConversationRuntimeVariables = {
  last_message?: string;
  last_button_id?: string;
  last_button_title?: string;
  last_selection_type?: InteractionSelectionType;
  channel?: string;
};

export type ExtractInteractiveSelectionOptions = {
  /** Handler or engine hint passed through normalizeInteractionType(). */
  fallbackHint?: unknown;
};

export function readConversationVariables(
  variables: Record<string, unknown>,
): ConversationRuntimeVariables {
  const conversation = variables.conversation;
  if (!conversation || typeof conversation !== "object" || Array.isArray(conversation)) {
    return {};
  }
  return conversation as ConversationRuntimeVariables;
}

export function mergeConversationVariables(
  variables: Record<string, unknown>,
  patch: ConversationRuntimeVariables,
): Record<string, unknown> {
  const current = readConversationVariables(variables);
  const next: ConversationRuntimeVariables = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      next[key as keyof ConversationRuntimeVariables] = value;
    }
  }

  return { ...variables, conversation: next };
}

function resolveInteractionSelectionType(
  input: Record<string, unknown>,
  options?: ExtractInteractiveSelectionOptions,
): InteractionSelectionType | undefined {
  const candidates: unknown[] = [input.interactionType, input.selectionType, input.outboundKind];

  const interactivePayload = input.interactivePayload;
  if (interactivePayload && typeof interactivePayload === "object" && !Array.isArray(interactivePayload)) {
    candidates.push((interactivePayload as { source?: unknown }).source);
  }

  if (options?.fallbackHint !== undefined) {
    candidates.push(options.fallbackHint);
  }

  for (const candidate of candidates) {
    const normalized = normalizeInteractionType(candidate);
    if (normalized) return normalized;
  }

  return undefined;
}

/** Promote an interactive reply payload into conversation runtime variables. */
export function extractInteractiveSelection(
  input: Record<string, unknown>,
  options?: ExtractInteractiveSelectionOptions,
): ConversationRuntimeVariables | null {
  const replyId = typeof input.replyId === "string" ? input.replyId.trim() : "";
  const waitingValue =
    typeof input[INTERACTIVE_SELECTION_INPUT_KEY] === "string"
      ? input[INTERACTIVE_SELECTION_INPUT_KEY].trim()
      : "";
  const title =
    (typeof input.title === "string" ? input.title.trim() : "") ||
    waitingValue;

  if (!replyId && !title) return null;

  const resolvedTitle = title || replyId;
  const resolvedId = replyId || title;
  const lastSelectionType = resolveInteractionSelectionType(input, options);

  return {
    last_button_id: resolvedId,
    last_button_title: resolvedTitle,
    last_message: resolvedTitle,
    ...(lastSelectionType ? { last_selection_type: lastSelectionType } : {}),
  };
}
