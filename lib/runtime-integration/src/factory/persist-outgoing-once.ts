import { DuplicateExternalMessageError } from "@workspace/ai-conversation";
import { RuntimeDomainError, createRuntimeErrorDescriptor } from "../errors.js";

/** Stable outgoing key for one inbound turn. Matches the channel replay lookup. */
export function assistantReplyExternalId(correlationId: string): string {
  return `assistant-reply:${correlationId.trim()}`;
}

function isDuplicateInsert(error: unknown): boolean {
  if (error instanceof DuplicateExternalMessageError) return true;
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "23505";
}

/**
 * Insert the assistant reply once per inbound correlation.
 * A unique external id is the database guard for concurrent retries.
 * A failed insert that is not a duplicate becomes a persistence error, not a provider error.
 */
export async function persistOutgoingOnce<T>(input: {
  correlationId: string | null | undefined;
  insert: (externalMessageId: string | null) => Promise<T>;
  findExisting: (externalMessageId: string) => Promise<T | null>;
}): Promise<{ message: T; reused: boolean }> {
  const externalMessageId = input.correlationId?.trim()
    ? assistantReplyExternalId(input.correlationId)
    : null;
  try {
    const message = await input.insert(externalMessageId);
    return { message, reused: false };
  } catch (error) {
    if (externalMessageId && isDuplicateInsert(error)) {
      const existing = await input.findExisting(externalMessageId);
      if (existing) return { message: existing, reused: true };
    }
    if (error instanceof RuntimeDomainError) throw error;
    const developerMessage = error instanceof Error ? error.message : "Outgoing message persistence failed.";
    throw new RuntimeDomainError(
      createRuntimeErrorDescriptor(
        "PERSISTENCE_FAILED",
        "persistence",
        "The assistant reply could not be saved.",
        developerMessage,
        true,
      ),
      input.correlationId ?? null,
    );
  }
}
