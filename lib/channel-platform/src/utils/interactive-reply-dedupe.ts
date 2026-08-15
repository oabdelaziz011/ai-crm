const INTERACTIVE_REPLY_DEDUPE_TTL_MS = 60_000;

const claimedInteractiveReplies = new Map<string, number>();

function interactiveReplyClaimKey(
  companyChannelId: string,
  externalThreadId: string,
  replyId: string,
  contextMessageId: string | null | undefined,
): string {
  // Scope by the outbound list/button message being replied to. Otherwise picking
  // the same doctor/service id on a later list (pricing vs booking) gets false-deduped.
  const contextKey =
    typeof contextMessageId === "string" && contextMessageId.trim()
      ? contextMessageId.trim()
      : "_";
  return `${companyChannelId}:${externalThreadId}:${contextKey}:${replyId}`;
}

function pruneInteractiveReplyClaims(now: number): void {
  for (const [key, claimedAt] of claimedInteractiveReplies) {
    if (now - claimedAt >= INTERACTIVE_REPLY_DEDUPE_TTL_MS) {
      claimedInteractiveReplies.delete(key);
    }
  }
}

/**
 * Claim an interactive list/button reply for this thread + list context.
 * Returns false when the same replyId was already claimed recently for the same
 * outbound list message (Meta sometimes delivers the same tap under different wamids).
 */
export function claimInteractiveReplyDedupe(input: {
  companyChannelId: string;
  externalThreadId: string;
  replyId: string;
  contextMessageId?: string | null;
  now?: number;
}): boolean {
  const replyId = input.replyId.trim();
  if (!replyId) return true;
  const now = input.now ?? Date.now();
  pruneInteractiveReplyClaims(now);
  const key = interactiveReplyClaimKey(
    input.companyChannelId,
    input.externalThreadId,
    replyId,
    input.contextMessageId,
  );
  const existing = claimedInteractiveReplies.get(key);
  if (existing != null && now - existing < INTERACTIVE_REPLY_DEDUPE_TTL_MS) {
    return false;
  }
  claimedInteractiveReplies.set(key, now);
  return true;
}

export function releaseInteractiveReplyDedupe(input: {
  companyChannelId: string;
  externalThreadId: string;
  replyId: string;
  contextMessageId?: string | null;
}): void {
  const replyId = input.replyId.trim();
  if (!replyId) return;
  claimedInteractiveReplies.delete(
    interactiveReplyClaimKey(
      input.companyChannelId,
      input.externalThreadId,
      replyId,
      input.contextMessageId,
    ),
  );
}

export function resetInteractiveReplyDedupeForTests(): void {
  claimedInteractiveReplies.clear();
}

function readMessageRecord(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!payload) return null;

  const message = payload.message;
  if (message && typeof message === "object" && !Array.isArray(message)) {
    return message as Record<string, unknown>;
  }

  const raw = payload.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = (raw as { entry?: unknown }).entry;
  const firstEntry = Array.isArray(entry) ? entry[0] : null;
  const changes =
    firstEntry && typeof firstEntry === "object"
      ? (firstEntry as { changes?: unknown }).changes
      : null;
  const firstChange = Array.isArray(changes) ? changes[0] : null;
  const value =
    firstChange && typeof firstChange === "object"
      ? (firstChange as { value?: unknown }).value
      : null;
  const messages =
    value && typeof value === "object" ? (value as { messages?: unknown }).messages : null;
  const firstMessage = Array.isArray(messages) ? messages[0] : null;
  if (!firstMessage || typeof firstMessage !== "object" || Array.isArray(firstMessage)) return null;
  return firstMessage as Record<string, unknown>;
}

export function extractInteractiveReplyIdFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;

  const metadata = payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const replyId = (metadata as Record<string, unknown>).replyId;
    if (typeof replyId === "string" && replyId.trim()) return replyId.trim();
  }

  const record = readMessageRecord(payload);
  if (!record || record.type !== "interactive") return null;
  const interactive = record.interactive;
  if (!interactive || typeof interactive !== "object" || Array.isArray(interactive)) return null;
  const interactiveRecord = interactive as Record<string, unknown>;
  const listReply = interactiveRecord.list_reply;
  const buttonReply = interactiveRecord.button_reply;
  for (const candidate of [listReply, buttonReply]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const id = (candidate as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

/** WhatsApp `context.id` of the list/button message the customer tapped. */
export function extractInteractiveReplyContextIdFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;

  const metadata = payload.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const contextId = (metadata as Record<string, unknown>).contextMessageId;
    if (typeof contextId === "string" && contextId.trim()) return contextId.trim();
  }

  const record = readMessageRecord(payload);
  if (!record) return null;
  const context = record.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const id = (context as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export { INTERACTIVE_REPLY_DEDUPE_TTL_MS };
