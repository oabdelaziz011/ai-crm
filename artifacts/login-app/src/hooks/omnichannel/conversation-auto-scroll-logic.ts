export const CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX = 80;

export type MessageListChangeKind = "none" | "append" | "prepend" | "replace";

export function isNearScrollBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  threshold = CONVERSATION_NEAR_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function detectMessageListChange(
  previousIds: readonly string[],
  nextIds: readonly string[],
): MessageListChangeKind {
  if (previousIds.length === nextIds.length && previousIds.every((id, index) => id === nextIds[index])) {
    return "none";
  }

  if (nextIds.length === 0) {
    return previousIds.length === 0 ? "none" : "replace";
  }

  if (previousIds.length === 0) {
    return "replace";
  }

  if (nextIds.length > previousIds.length) {
    const previousIsPrefix = previousIds.every((id, index) => id === nextIds[index]);
    if (previousIsPrefix) {
      return "append";
    }

    const previousIsSuffix = previousIds.every(
      (id, index) => id === nextIds[nextIds.length - previousIds.length + index],
    );
    if (previousIsSuffix) {
      return "prepend";
    }
  }

  return "replace";
}
