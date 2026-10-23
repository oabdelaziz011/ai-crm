import {
  recoverGeneratedReply,
  type GeneratedReplyRecoveryResult,
} from "./recover-generated-reply.js";
import type { ConfirmOutgoingDeliveryFn } from "./confirm-outgoing-delivery.js";

export const WHATSAPP_REPLY_RECOVERY_GRACE_MS = 120_000;
export const WHATSAPP_REPLY_RECOVERY_MAX_ATTEMPTS = 3;

export type StuckWhatsAppReply = {
  messageId: string;
  replyText?: string | null;
  outboundPhase?: string | null;
  deliveryStatus?: string | null;
  hasNewerInbound: boolean;
  externalMessageId?: string | null;
  recoveryAttempts: number;
  recoveryDisposition?: "confirmed" | "needs_review" | null;
  ageMs: number;
};

export function toStuckWhatsAppReply(input: {
  id: string;
  content?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  deliveryStatus?: string | null;
  externalMessageId?: string | null;
  hasNewerInbound: boolean;
  nowMs?: number;
}): StuckWhatsAppReply {
  const metadata = input.metadata ?? {};
  const createdMs = Date.parse(input.createdAt);
  const attempts = Number(metadata.whatsappRecoveryAttempts ?? 0);
  const disposition = metadata.whatsappRecoveryDisposition;
  return {
    messageId: input.id,
    replyText: input.content ?? null,
    outboundPhase: typeof metadata.outboundPhase === "string" ? metadata.outboundPhase : null,
    deliveryStatus: input.deliveryStatus ?? null,
    hasNewerInbound: input.hasNewerInbound,
    externalMessageId: input.externalMessageId ?? null,
    recoveryAttempts: Number.isFinite(attempts) ? attempts : 0,
    recoveryDisposition:
      disposition === "confirmed" || disposition === "needs_review" ? disposition : null,
    ageMs: Number.isFinite(createdMs) ? Math.max(0, (input.nowMs ?? Date.now()) - createdMs) : 0,
  };
}

export type StuckWhatsAppReplyDecision = {
  messageId: string;
  disposition: "confirmed" | "needs_review" | "in_flight" | "unchanged";
  persisted: boolean;
  attempts: number;
  outcome: GeneratedReplyRecoveryResult | { action: "skip"; reason: "already_settled" | "still_fresh" };
};

/**
 * Classify stuck outgoing rows. Never sends.
 * Fresh rows stay untouched so an in-flight send is not frozen.
 * Pending, missing delivery, missing text, and a newer inbound stay needs_review.
 * A provider-accepted row is confirm-only.
 */
export async function planStuckWhatsAppReplyRecovery(
  candidates: readonly StuckWhatsAppReply[],
  confirm: ConfirmOutgoingDeliveryFn,
  options?: { graceMs?: number; maxAttempts?: number },
): Promise<StuckWhatsAppReplyDecision[]> {
  const graceMs = options?.graceMs ?? WHATSAPP_REPLY_RECOVERY_GRACE_MS;
  const maxAttempts = options?.maxAttempts ?? WHATSAPP_REPLY_RECOVERY_MAX_ATTEMPTS;
  const decisions: StuckWhatsAppReplyDecision[] = [];

  for (const candidate of candidates) {
    if (candidate.recoveryDisposition === "confirmed" || candidate.recoveryDisposition === "needs_review") {
      decisions.push({
        messageId: candidate.messageId,
        disposition: "unchanged",
        persisted: false,
        attempts: candidate.recoveryAttempts,
        outcome: { action: "skip", reason: "already_settled" },
      });
      continue;
    }
    if (candidate.ageMs < graceMs) {
      decisions.push({
        messageId: candidate.messageId,
        disposition: "in_flight",
        persisted: false,
        attempts: candidate.recoveryAttempts,
        outcome: { action: "skip", reason: "still_fresh" },
      });
      continue;
    }

    const outcome = await recoverGeneratedReply(
      {
        replyText: candidate.replyText,
        outboundPhase: candidate.outboundPhase,
        deliveryStatus: candidate.deliveryStatus,
        hasNewerInbound: candidate.hasNewerInbound,
        messageId: candidate.messageId,
        externalMessageId: candidate.externalMessageId,
      },
      confirm,
    );

    if (outcome.action === "confirm_only" && outcome.confirmed) {
      decisions.push({
        messageId: candidate.messageId,
        disposition: "confirmed",
        persisted: true,
        attempts: candidate.recoveryAttempts,
        outcome,
      });
      continue;
    }

    const attempts = candidate.recoveryAttempts + (outcome.action === "confirm_only" ? outcome.attempts : 1);
    const giveUp = outcome.action === "skip" || attempts >= maxAttempts;
    decisions.push({
      messageId: candidate.messageId,
      disposition: giveUp ? "needs_review" : "unchanged",
      persisted: giveUp,
      attempts,
      outcome,
    });
  }

  return decisions;
}
