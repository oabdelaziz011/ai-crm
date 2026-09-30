import {
  QuoteSendClientError,
  type QuoteSendChannel,
  type QuoteSendUnavailableReason,
} from "./quote-send-types";

export type QuoteSendOutcome = "sent" | "failed" | "unknown";

/**
 * One idempotency key per send intent (quote + channel). The key is kept when the outcome is
 * unknown (network drop, timeout) so a retry replays the same server attempt instead of sending
 * twice; it is discarded after a definitive result so "send again" creates a new attempt.
 */
export function createQuoteSendKeyStore(generate: () => string = () => crypto.randomUUID()) {
  const keys = new Map<string, string>();
  const slot = (quoteId: string, channel: QuoteSendChannel) => `${quoteId}:${channel}`;
  return {
    acquire(quoteId: string, channel: QuoteSendChannel): string {
      const id = slot(quoteId, channel);
      const existing = keys.get(id);
      if (existing) return existing;
      const key = `quote-send:${generate()}`;
      keys.set(id, key);
      return key;
    },
    settle(quoteId: string, channel: QuoteSendChannel, outcome: QuoteSendOutcome): void {
      if (outcome !== "unknown") keys.delete(slot(quoteId, channel));
    },
  };
}

export function classifyQuoteSendError(error: unknown): QuoteSendOutcome {
  if (!(error instanceof QuoteSendClientError)) return "unknown";
  if (error.code === "send_in_progress") return "unknown";
  if (error.status >= 500 && error.status !== 502) return "unknown";
  return "failed";
}

export function quoteSendUnavailableReasonKey(reason: QuoteSendUnavailableReason | null): string {
  return `quotes.send.unavailable.${reason ?? "unknown"}`;
}

export function quoteSendUnavailableCode(error: unknown): QuoteSendUnavailableReason | null {
  if (!(error instanceof QuoteSendClientError)) return null;
  if (!error.code.startsWith("channel_unavailable:")) return null;
  return error.code.slice("channel_unavailable:".length) as QuoteSendUnavailableReason;
}
