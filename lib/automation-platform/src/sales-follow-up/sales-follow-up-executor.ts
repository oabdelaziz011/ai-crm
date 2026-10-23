/**
 * Runs one sales follow-up attempt: recheck policy, optionally deliver via the
 * existing outbound stack, then persist the real outcome. A draft or internal
 * accept is never recorded as sent.
 */

import {
  evaluateSalesFollowUp,
  salesFollowUpIdempotencyKey,
  type SalesFollowUpChannel,
  type SalesFollowUpDecision,
  type SalesFollowUpOutcome,
  type SalesFollowUpSnapshot,
} from "./sales-follow-up.js";

export type SalesFollowUpDeliveryRequest = {
  companyId: string;
  leadId: string;
  channel: SalesFollowUpChannel;
  conversationId: string;
  companyChannelId: string;
  externalThreadId: string;
  text: string;
  idempotencyKey: string;
};

export type SalesFollowUpDeliveryResult =
  | { status: "delivered"; providerMessageId: string | null }
  | { status: "failed"; retryable: boolean; error: string };

/**
 * Inject the existing channel/outbound path (e.g. omnichannel dispatch).
 * Do not implement a parallel sender here.
 */
export type SalesFollowUpDeliveryPort = {
  deliver(input: SalesFollowUpDeliveryRequest): Promise<SalesFollowUpDeliveryResult>;
};

export type SalesFollowUpAttemptRecord = {
  companyId: string;
  leadId: string;
  idempotencyKey: string;
  channel: SalesFollowUpChannel | null;
  outcome: SalesFollowUpOutcome;
  reason: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  conversationId: string | null;
};

export type SalesFollowUpAttemptDeliveryState = {
  exists: boolean;
  outcome: SalesFollowUpOutcome | string | null;
  providerMessageId: string | null;
};

export type SalesFollowUpAttemptStore = {
  hasIdempotencyKey(companyId: string, idempotencyKey: string): Promise<boolean>;
  /** Optional richer lookup so retries never call the provider after a prior send/claim. */
  getDeliveryState?(
    companyId: string,
    idempotencyKey: string,
  ): Promise<SalesFollowUpAttemptDeliveryState>;
  /**
   * Insert a claim row for this idempotency key. Returns false if another worker
   * already claimed or completed the same key (unique constraint).
   */
  tryClaim?(attempt: Omit<SalesFollowUpAttemptRecord, "outcome" | "reason" | "providerMessageId" | "errorMessage"> & {
    outcome?: SalesFollowUpOutcome;
    reason?: string;
  }): Promise<boolean>;
  record(attempt: SalesFollowUpAttemptRecord): Promise<void>;
};

export type ExecuteSalesFollowUpInput = {
  snapshot: SalesFollowUpSnapshot;
  conversationId: string;
  companyChannelId: string;
  externalThreadId: string;
  messageText: string;
  delivery: SalesFollowUpDeliveryPort;
  attempts: SalesFollowUpAttemptStore;
};

export type ExecuteSalesFollowUpResult = {
  decision: SalesFollowUpDecision;
  recordedOutcome: SalesFollowUpOutcome;
  providerMessageId: string | null;
  delivered: boolean;
};

export async function executeSalesFollowUpAttempt(
  input: ExecuteSalesFollowUpInput,
): Promise<ExecuteSalesFollowUpResult> {
  const idempotencyKey = salesFollowUpIdempotencyKey(
    input.snapshot.companyId,
    input.snapshot.leadId,
    input.snapshot.attemptNumber,
    input.snapshot.dueAt,
  );
  const deliveryState =
    typeof input.attempts.getDeliveryState === "function"
      ? await input.attempts.getDeliveryState(input.snapshot.companyId, idempotencyKey)
      : {
          exists: await input.attempts.hasIdempotencyKey(input.snapshot.companyId, idempotencyKey),
          outcome: null,
          providerMessageId: null,
        };

  const priorOutcome = String(deliveryState.outcome ?? "").toLowerCase();

  // A prior successful send must never be retried, even if the job lease was reclaimed.
  if (deliveryState.exists && priorOutcome === "sent") {
    return {
      decision: {
        outcome: "skipped",
        reason: "already_sent",
        send: false,
        idempotencyKey,
      },
      recordedOutcome: "skipped",
      providerMessageId: deliveryState.providerMessageId,
      delivered: false,
    };
  }

  // Transient provider failure left outcome=retried: allow one reclaim send.
  // Definitive outcomes still count as "seen" so evaluateSalesFollowUp skips duplicates.
  const reclaimableRetry = priorOutcome === "retried";
  const seen = deliveryState.exists && !reclaimableRetry;
  const snapshot: SalesFollowUpSnapshot = {
    ...input.snapshot,
    idempotencyKeySeen: input.snapshot.idempotencyKeySeen || seen,
    // Do not force transientFailure here — that path records retried without sending.
    transientFailure: reclaimableRetry ? false : input.snapshot.transientFailure,
  };
  const decision = evaluateSalesFollowUp(snapshot);

  const persist = async (attempt: SalesFollowUpAttemptRecord) => {
    await input.attempts.record(attempt);
  };

  if (!decision.send) {
    // Never overwrite a prior definitive attempt (e.g. sent) with a duplicate skip.
    if (!(seen && decision.reason === "duplicate_attempt")) {
      await persist({
        companyId: snapshot.companyId,
        leadId: snapshot.leadId,
        idempotencyKey: decision.idempotencyKey,
        channel: snapshot.channel,
        outcome: decision.outcome,
        reason: decision.reason,
        providerMessageId: null,
        errorMessage: null,
        conversationId: input.conversationId,
      });
    }
    return {
      decision,
      recordedOutcome: decision.outcome,
      providerMessageId: null,
      delivered: false,
    };
  }

  if (!snapshot.channel) {
    await persist({
      companyId: snapshot.companyId,
      leadId: snapshot.leadId,
      idempotencyKey: decision.idempotencyKey,
      channel: null,
      outcome: "draft",
      reason: "channel_unavailable",
      providerMessageId: null,
      errorMessage: null,
      conversationId: input.conversationId,
    });
    return {
      decision: { ...decision, outcome: "draft", send: false, reason: "channel_unavailable" },
      recordedOutcome: "draft",
      providerMessageId: null,
      delivered: false,
    };
  }

  // Empty / whitespace messages must never hit the provider.
  if (!input.messageText.trim() || input.messageText.trim() === "(skipped)") {
    await persist({
      companyId: snapshot.companyId,
      leadId: snapshot.leadId,
      idempotencyKey: decision.idempotencyKey,
      channel: snapshot.channel,
      outcome: "failed",
      reason: "empty_message",
      providerMessageId: null,
      errorMessage: "empty_message",
      conversationId: input.conversationId,
    });
    return {
      decision: { ...decision, outcome: "failed", send: false, reason: "empty_message" },
      recordedOutcome: "failed",
      providerMessageId: null,
      delivered: false,
    };
  }

  // Claim the idempotency key before calling the provider so two workers cannot both send.
  // A prior "retried" row (transient provider failure) may reclaim for one more send attempt.
  // Definitive outcomes (sent / failed / skipped / draft / cancelled) still block.
  if (typeof input.attempts.tryClaim === "function") {
    const claimed = await input.attempts.tryClaim({
      companyId: snapshot.companyId,
      leadId: snapshot.leadId,
      idempotencyKey: decision.idempotencyKey,
      channel: snapshot.channel,
      conversationId: input.conversationId,
      outcome: "scheduled",
      reason: reclaimableRetry ? "retry_reclaim" : "claim",
    });
    if (!claimed && !reclaimableRetry) {
      return {
        decision: { ...decision, outcome: "skipped", send: false, reason: "duplicate_attempt" },
        recordedOutcome: "skipped",
        providerMessageId: null,
        delivered: false,
      };
    }
  } else if (seen && !reclaimableRetry) {
    return {
      decision: { ...decision, outcome: "skipped", send: false, reason: "duplicate_attempt" },
      recordedOutcome: "skipped",
      providerMessageId: null,
      delivered: false,
    };
  }

  let delivery: SalesFollowUpDeliveryResult;
  try {
    delivery = await input.delivery.deliver({
      companyId: snapshot.companyId,
      leadId: snapshot.leadId,
      channel: snapshot.channel,
      conversationId: input.conversationId,
      companyChannelId: input.companyChannelId,
      externalThreadId: input.externalThreadId,
      text: input.messageText,
      idempotencyKey: decision.idempotencyKey,
    });
  } catch (error) {
    delivery = {
      status: "failed",
      retryable: true,
      error: error instanceof Error ? error.message : "Delivery threw unexpectedly.",
    };
  }

  if (delivery.status === "delivered") {
    await persist({
      companyId: snapshot.companyId,
      leadId: snapshot.leadId,
      idempotencyKey: decision.idempotencyKey,
      channel: snapshot.channel,
      outcome: "sent",
      reason: "provider_accepted",
      providerMessageId: delivery.providerMessageId,
      errorMessage: null,
      conversationId: input.conversationId,
    });
    return {
      decision,
      recordedOutcome: "sent",
      providerMessageId: delivery.providerMessageId,
      delivered: true,
    };
  }

  const outcome: SalesFollowUpOutcome = delivery.retryable ? "retried" : "failed";
  await persist({
    companyId: snapshot.companyId,
    leadId: snapshot.leadId,
    idempotencyKey: decision.idempotencyKey,
    channel: snapshot.channel,
    outcome,
    reason: delivery.retryable ? "provider_transient_failure" : "provider_rejected",
    providerMessageId: null,
    errorMessage: delivery.error,
    conversationId: input.conversationId,
  });
  return {
    decision: { ...decision, outcome, send: false, reason: delivery.error },
    recordedOutcome: outcome,
    providerMessageId: null,
    delivered: false,
  };
}
