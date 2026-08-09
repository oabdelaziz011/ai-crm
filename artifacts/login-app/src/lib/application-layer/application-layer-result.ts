/**
 * Safe helpers for application-layer CommandResult / QueryResult envelopes.
 * CommandResult uses `{ data, correlationId, eventIds }` — not `{ ok, error }`.
 */

export function resolveApplicationErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nestedError = record.error;
    if (nestedError && typeof nestedError === "object" && "message" in nestedError) {
      const message = (nestedError as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }
  return fallback;
}

export function unwrapCommandResult<T>(result: { data: T }): T {
  return result.data;
}

export function unwrapQueryResult<T>(result: { data: T }): T {
  return result.data;
}

/**
 * Legacy guard for callers that may receive `{ ok: false, error }` envelopes.
 * Never reads `.message` from an unknown object without checks.
 */
export function assertApplicationCommandResult<T>(
  result: unknown,
  fallback = "Command failed",
): T {
  if (result && typeof result === "object" && "ok" in result && (result as { ok: unknown }).ok === false) {
    throw new Error(resolveApplicationErrorMessage(result, fallback));
  }
  if (result && typeof result === "object" && "data" in result) {
    return (result as { data: T }).data;
  }
  throw new Error(fallback);
}

/** Reproduces the pre-fix bug: `if (!result.ok) throw new Error(result.error.message)`. */
export function legacyUnsafeCommandFailure(result: {
  ok?: boolean;
  error?: { message?: string };
}): never {
  if (!result.ok) {
    throw new Error(result.error!.message);
  }
  throw new Error("unreachable");
}
