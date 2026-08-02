import type { ConversationMessageRecord } from "../types.js";

/** Newest-first fetch window → chronological transcript order (oldest → newest). */
export function chronologicalFromLatestWindow(
  messagesNewestFirst: ConversationMessageRecord[],
): ConversationMessageRecord[] {
  return [...messagesNewestFirst].sort(compareMessagesChronologically);
}

export function compareMessagesChronologically(
  left: ConversationMessageRecord,
  right: ConversationMessageRecord,
): number {
  if (left.sequence_number !== right.sequence_number) {
    return left.sequence_number - right.sequence_number;
  }
  return Date.parse(left.created_at) - Date.parse(right.created_at);
}

export function newestMessageInList(messages: ConversationMessageRecord[]): ConversationMessageRecord | null {
  if (messages.length === 0) return null;
  return [...messages].sort((a, b) => compareMessagesChronologically(b, a))[0] ?? null;
}
