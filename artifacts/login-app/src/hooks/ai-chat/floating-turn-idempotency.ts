export type FloatingTurnKey = {
  conversationId: string;
  text: string;
  key: string;
};

/**
 * Reuse the idempotency key only for another attempt of the same unsent text.
 * A successful reply clears the previous key. A reload starts with no previous key,
 * so the next send is a new inbound turn.
 */
export function resolveFloatingTurnIdempotencyKey(input: {
  conversationId: string;
  text: string;
  previousFailedTurn: FloatingTurnKey | null;
  createKey: () => string;
}): string {
  const previous = input.previousFailedTurn;
  if (
    previous &&
    previous.conversationId === input.conversationId &&
    previous.text === input.text
  ) {
    return previous.key;
  }
  return input.createKey();
}
