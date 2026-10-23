import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  type SalesFollowUpSnapshot,
} from "./sales-follow-up.js";
import {
  executeSalesFollowUpAttempt,
  type SalesFollowUpAttemptRecord,
  type SalesFollowUpDeliveryPort,
} from "./sales-follow-up-executor.js";

function snapshot(overrides: Partial<SalesFollowUpSnapshot> = {}): SalesFollowUpSnapshot {
  const dueAt = new Date("2026-10-17T10:00:00.000Z");
  return {
    companyId: "company-a",
    leadId: "lead-1",
    attemptNumber: 1,
    dueAt,
    now: new Date("2026-10-17T10:05:00.000Z"),
    settings: {
      ...DEFAULT_SALES_FOLLOW_UP_SETTINGS,
      enabled: true,
      channels: ["whatsapp"],
      approvalMode: "automatic",
      maxAttempts: 2,
    },
    channel: "whatsapp",
    channelConnected: true,
    channelCanSend: true,
    optedOut: false,
    customerRepliedAfterSchedule: false,
    converted: false,
    purchased: false,
    requestClosed: false,
    assigneeChanged: false,
    attemptsAlreadySent: 0,
    companySentToday: 0,
    idempotencyKeySeen: false,
    transientFailure: false,
    withinBusinessHours: true,
    ...overrides,
  };
}

function memoryAttempts() {
  const rows: SalesFollowUpAttemptRecord[] = [];
  return {
    rows,
    store: {
      async hasIdempotencyKey(_companyId: string, key: string) {
        return rows.some((row) => row.idempotencyKey === key);
      },
      async getDeliveryState(_companyId: string, key: string) {
        const row = rows.find((entry) => entry.idempotencyKey === key);
        if (!row) return { exists: false, outcome: null, providerMessageId: null };
        return {
          exists: true,
          outcome: row.outcome,
          providerMessageId: row.providerMessageId,
        };
      },
      async tryClaim(attempt: {
        idempotencyKey: string;
        companyId: string;
        leadId: string;
        channel: string | null;
        conversationId: string | null;
        outcome?: string;
        reason?: string;
      }) {
        const existing = rows.find((row) => row.idempotencyKey === attempt.idempotencyKey);
        if (existing) {
          if (String(existing.outcome).toLowerCase() !== "retried") return false;
          existing.outcome = (attempt.outcome as SalesFollowUpAttemptRecord["outcome"]) ?? "scheduled";
          existing.reason = attempt.reason ?? "retry_reclaim";
          return true;
        }
        rows.push({
          companyId: attempt.companyId,
          leadId: attempt.leadId,
          idempotencyKey: attempt.idempotencyKey,
          channel: attempt.channel,
          outcome: (attempt.outcome as SalesFollowUpAttemptRecord["outcome"]) ?? "scheduled",
          reason: attempt.reason ?? "claim",
          providerMessageId: null,
          errorMessage: null,
          conversationId: attempt.conversationId,
        });
        return true;
      },
      async record(attempt: SalesFollowUpAttemptRecord) {
        const idx = rows.findIndex((row) => row.idempotencyKey === attempt.idempotencyKey);
        if (idx >= 0) {
          rows[idx] = attempt;
          return;
        }
        rows.push(attempt);
      },
    },
  };
}

describe("executeSalesFollowUpAttempt", () => {
  it("does not mark draft or disabled attempts as sent", async () => {
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        throw new Error("must not send");
      },
    };
    const disabledStore = memoryAttempts();
    const disabled = await executeSalesFollowUpAttempt({
      snapshot: snapshot({ settings: { ...snapshot().settings, enabled: false } }),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: disabledStore.store,
    });
    assert.equal(disabled.delivered, false);
    assert.equal(disabled.recordedOutcome, "skipped");
    assert.equal(disabledStore.rows[0]?.outcome, "skipped");

    const draftStore = memoryAttempts();
    const draft = await executeSalesFollowUpAttempt({
      snapshot: snapshot({ settings: { ...snapshot().settings, approvalMode: "draft" } }),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: draftStore.store,
    });
    assert.equal(draft.recordedOutcome, "draft");
    assert.equal(draft.delivered, false);
    assert.equal(draftStore.rows[0]?.outcome, "draft");
  });

  it("records sent only after the provider accepts delivery", async () => {
    const { rows, store } = memoryAttempts();
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        return { status: "delivered", providerMessageId: "wamid.ABC" };
      },
    };
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: store,
    });
    assert.equal(result.delivered, true);
    assert.equal(result.recordedOutcome, "sent");
    assert.equal(result.providerMessageId, "wamid.ABC");
    assert.equal(rows[0]?.providerMessageId, "wamid.ABC");
    assert.equal(rows[0]?.outcome, "sent");
  });

  it("records provider failure without claiming success, then reclaims retried for a second send", async () => {
    const { rows, store } = memoryAttempts();
    let calls = 0;
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        calls += 1;
        if (calls === 1) return { status: "failed", retryable: true, error: "timeout" };
        return { status: "delivered", providerMessageId: "wamid.RETRY" };
      },
    };
    const failed = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: store,
    });
    assert.equal(failed.delivered, false);
    assert.equal(failed.recordedOutcome, "retried");
    assert.equal(rows[0]?.outcome, "retried");
    assert.equal(rows[0]?.providerMessageId, null);

    const again = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: store,
    });
    assert.equal(again.recordedOutcome, "sent");
    assert.equal(again.delivered, true);
    assert.equal(calls, 2);
    assert.equal(rows[0]?.outcome, "sent");
    assert.equal(rows[0]?.providerMessageId, "wamid.RETRY");
  });

  it("still blocks a second send after a definitive failed (non-retryable) outcome", async () => {
    const { rows, store } = memoryAttempts();
    let calls = 0;
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        calls += 1;
        return { status: "failed", retryable: false, error: "rejected" };
      },
    };
    const failed = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: store,
    });
    assert.equal(failed.recordedOutcome, "failed");

    const again = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery,
      attempts: store,
    });
    assert.equal(again.recordedOutcome, "skipped");
    assert.equal(again.decision.reason, "duplicate_attempt");
    assert.equal(calls, 1);
    assert.equal(rows.filter((row) => row.outcome === "sent").length, 0);
  });

  it("creates a draft when the channel is disconnected and never calls delivery", async () => {
    let called = false;
    const { rows, store } = memoryAttempts();
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot({ channelConnected: false }),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery: {
        async deliver() {
          called = true;
          return { status: "delivered", providerMessageId: "should-not" };
        },
      },
      attempts: store,
    });
    assert.equal(called, false);
    assert.equal(result.recordedOutcome, "draft");
    assert.equal(rows[0]?.outcome, "draft");
  });

  it("cancels after opt-out without sending", async () => {
    const { store } = memoryAttempts();
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot({ optedOut: true }),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "follow up",
      delivery: {
        async deliver() {
          throw new Error("must not send");
        },
      },
      attempts: store,
    });
    assert.equal(result.recordedOutcome, "cancelled");
    assert.equal(result.delivered, false);
  });
});
