/**
 * Confirm a pre-persisted conversation_messages row after provider send.
 * Idempotent via confirm_conversation_message_outbound (status/metadata merge).
 * Retries transient failures; never implies a provider resend.
 */

export type ConfirmOutgoingDeliveryFn = (input: {
  messageId: string;
  status: string;
  externalMessageId?: string | null;
}) => Promise<void>;

export type ConfirmOutgoingDeliveryResult =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; error: unknown };

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 40;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function confirmOutgoingDeliveryWithRetry(
  confirm: ConfirmOutgoingDeliveryFn,
  input: {
    messageId: string;
    status: string;
    externalMessageId?: string | null;
  },
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    onAttemptError?: (error: unknown, attempt: number) => void;
  },
): Promise<ConfirmOutgoingDeliveryResult> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_ATTEMPTS);
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await confirm(input);
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      options?.onAttemptError?.(error, attempt);
      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt);
      }
    }
  }

  return { ok: false, attempts: maxAttempts, error: lastError };
}

const PROVIDER_ACCEPTED_DELIVERY_STATUSES = new Set(["sent", "delivered", "read"]);
const UNCONFIRMED_OUTBOUND_PHASES = new Set(["preparing", "dispatching"]);

export type UnconfirmedOutgoingConfirmationResult =
  | { ok: true; attempted: false; reason: "provider_not_accepted" | "already_confirmed" }
  | { ok: true; attempted: true; attempts: number }
  | { ok: false; attempted: true; attempts: number; error: unknown };

/**
 * Confirm a conversation message that the delivery record already accepted.
 * Does not send to a provider. Skips rows that are not still preparing/dispatching.
 * A failed confirm stays failed; success is reported only when confirm returns.
 */
export async function retryUnconfirmedOutgoingConfirmation(
  confirm: ConfirmOutgoingDeliveryFn,
  input: {
    messageId: string;
    deliveryStatus: string;
    externalMessageId?: string | null;
    outboundPhase?: string | null;
  },
  options?: {
    maxAttempts?: number;
    delayMs?: number;
    onAttemptError?: (error: unknown, attempt: number) => void;
  },
): Promise<UnconfirmedOutgoingConfirmationResult> {
  const deliveryStatus = input.deliveryStatus.trim().toLowerCase();
  const outboundPhase = (input.outboundPhase ?? "").trim().toLowerCase();
  if (!PROVIDER_ACCEPTED_DELIVERY_STATUSES.has(deliveryStatus)) {
    return { ok: true, attempted: false, reason: "provider_not_accepted" };
  }
  if (!UNCONFIRMED_OUTBOUND_PHASES.has(outboundPhase)) {
    return { ok: true, attempted: false, reason: "already_confirmed" };
  }

  const result = await confirmOutgoingDeliveryWithRetry(
    confirm,
    {
      messageId: input.messageId,
      status: deliveryStatus,
      externalMessageId: input.externalMessageId ?? null,
    },
    options,
  );
  if (result.ok) {
    return { ok: true, attempted: true, attempts: result.attempts };
  }

  const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
  console.error("[OUTBOUND_CONFIRM] unconfirmed outgoing confirmation still failed", {
    messageId: input.messageId,
    deliveryStatus,
    outboundPhase,
    externalMessageId: input.externalMessageId ?? null,
    attempts: result.attempts,
    error: errorMessage,
  });
  return { ok: false, attempted: true, attempts: result.attempts, error: result.error };
}
