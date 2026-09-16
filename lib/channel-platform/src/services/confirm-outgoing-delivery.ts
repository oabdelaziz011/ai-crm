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
