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
import { evaluateCompanyChannelRow } from "./sales-follow-up-channel-readiness.js";
import { cancelPendingSalesFollowUpJobsForLead } from "./sales-follow-up-orchestrate.js";

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
      maxAttempts: 3,
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

function richAttemptStore() {
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

describe("sales follow-up channel readiness", () => {
  it("allows active enabled channels with connected/unknown/warning health", () => {
    assert.equal(
      evaluateCompanyChannelRow({
        status: "active",
        health_status: "connected",
        is_enabled: true,
        deleted_at: null,
      }).canSend,
      true,
    );
    assert.equal(
      evaluateCompanyChannelRow({
        status: "active",
        health_status: "unknown",
        is_enabled: true,
        deleted_at: null,
      }).canSend,
      true,
    );
  });

  it("blocks disabled, inactive, or unhealthy channels", () => {
    assert.equal(
      evaluateCompanyChannelRow({
        status: "active",
        health_status: "disconnected",
        is_enabled: true,
        deleted_at: null,
      }).canSend,
      false,
    );
    assert.equal(
      evaluateCompanyChannelRow({
        status: "disabled",
        health_status: "connected",
        is_enabled: true,
        deleted_at: null,
      }).canSend,
      false,
    );
    assert.equal(
      evaluateCompanyChannelRow({
        status: "active",
        health_status: "connected",
        is_enabled: false,
        deleted_at: null,
      }).canSend,
      false,
    );
  });
});

describe("sales follow-up send idempotency under concurrency / restart", () => {
  it("only one concurrent worker delivers for the same idempotency key", async () => {
    const attempts = richAttemptStore();
    let deliverCalls = 0;
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        deliverCalls += 1;
        return { status: "delivered", providerMessageId: "msg-1" };
      },
    };

    const run = () =>
      executeSalesFollowUpAttempt({
        snapshot: snapshot(),
        conversationId: "conv-1",
        companyChannelId: "ch-1",
        externalThreadId: "ext-1",
        messageText: "Hello again",
        delivery,
        attempts: attempts.store,
      });

    const [a, b] = await Promise.all([run(), run()]);
    const deliveredCount = [a, b].filter((result) => result.delivered).length;
    assert.equal(deliveredCount, 1);
    assert.equal(deliverCalls, 1);
    assert.equal([a, b].some((result) => result.decision.reason === "duplicate_attempt"), true);
  });

  it("does not re-deliver after a prior sent outcome (worker restart)", async () => {
    const attempts = richAttemptStore();
    const dueAt = snapshot().dueAt;
    const key = `company-a:lead-1:1`;
    attempts.rows.push({
      companyId: "company-a",
      leadId: "lead-1",
      idempotencyKey: key,
      channel: "whatsapp",
      outcome: "sent",
      reason: "provider_accepted",
      providerMessageId: "msg-prev",
      errorMessage: null,
      conversationId: "conv-1",
    });

    let deliverCalls = 0;
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "Hello again",
      delivery: {
        async deliver() {
          deliverCalls += 1;
          return { status: "delivered", providerMessageId: "msg-2" };
        },
      },
      attempts: attempts.store,
    });

    assert.equal(result.delivered, false);
    assert.equal(result.decision.reason, "already_sent");
    assert.equal(deliverCalls, 0);
  });

  it("reclaims a prior retried row for one more provider attempt", async () => {
    const attempts = richAttemptStore();
    const dueAt = snapshot().dueAt;
    attempts.rows.push({
      companyId: "company-a",
      leadId: "lead-1",
      idempotencyKey: `company-a:lead-1:1`,
      channel: "whatsapp",
      outcome: "retried",
      reason: "provider_transient_failure",
      providerMessageId: null,
      errorMessage: "timeout",
      conversationId: "conv-1",
    });

    let deliverCalls = 0;
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "Hello again",
      delivery: {
        async deliver() {
          deliverCalls += 1;
          return { status: "delivered", providerMessageId: "msg-2" };
        },
      },
      attempts: attempts.store,
    });

    assert.equal(result.delivered, true);
    assert.equal(result.recordedOutcome, "sent");
    assert.equal(deliverCalls, 1);
    assert.equal(attempts.rows[0]?.outcome, "sent");
  });

  it("does not call provider again after a definitive failed row exists", async () => {
    const attempts = richAttemptStore();
    const dueAt = snapshot().dueAt;
    attempts.rows.push({
      companyId: "company-a",
      leadId: "lead-1",
      idempotencyKey: `company-a:lead-1:1`,
      channel: "whatsapp",
      outcome: "failed",
      reason: "provider_rejected",
      providerMessageId: null,
      errorMessage: "rejected",
      conversationId: "conv-1",
    });

    let deliverCalls = 0;
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "Hello again",
      delivery: {
        async deliver() {
          deliverCalls += 1;
          return { status: "delivered", providerMessageId: "msg-2" };
        },
      },
      attempts: attempts.store,
    });

    assert.equal(result.delivered, false);
    assert.equal(deliverCalls, 0);
  });

  it("refuses empty message text even when otherwise eligible", async () => {
    let deliverCalls = 0;
    const result = await executeSalesFollowUpAttempt({
      snapshot: snapshot(),
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "ext-1",
      messageText: "   ",
      delivery: {
        async deliver() {
          deliverCalls += 1;
          return { status: "delivered", providerMessageId: "x" };
        },
      },
      attempts: richAttemptStore().store,
    });
    assert.equal(result.delivered, false);
    assert.equal(result.decision.reason, "empty_message");
    assert.equal(deliverCalls, 0);
  });
});

describe("sales follow-up stop policy snapshots", () => {
  it("cancels when customer replied or lead closed/converted flags are set", async () => {
    const cases = [
      { customerRepliedAfterSchedule: true, reason: "customer_replied" },
      { converted: true, reason: "converted" },
      { requestClosed: true, reason: "request_closed" },
      { assigneeChanged: true, reason: "reassigned" },
    ] as const;

    for (const entry of cases) {
      const result = await executeSalesFollowUpAttempt({
        snapshot: snapshot({ ...entry }),
        conversationId: "conv-1",
        companyChannelId: "ch-1",
        externalThreadId: "ext-1",
        messageText: "hi",
        delivery: {
          async deliver() {
            throw new Error("must not send");
          },
        },
        attempts: richAttemptStore().store,
      });
      assert.equal(result.delivered, false, entry.reason);
      assert.equal(result.decision.reason, entry.reason);
      assert.equal(result.recordedOutcome, "cancelled");
    }
  });
});

describe("cancelPendingSalesFollowUpJobsForLead mock client", () => {
  it("updates pending and claimed rows for the lead", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from() {
        return {
          update(payload: Record<string, unknown>) {
            updates.push(payload);
            return {
              eq() {
                return this;
              },
              in() {
                return this;
              },
              async select() {
                return { data: [{ id: "j1" }, { id: "j2" }], error: null };
              },
            };
          },
        };
      },
    };

    const cancelled = await cancelPendingSalesFollowUpJobsForLead(client as never, {
      companyId: "company-a",
      leadId: "lead-1",
      reason: "customer_replied",
    });
    assert.equal(cancelled, 2);
    assert.equal(updates[0]?.status, "cancelled");
    assert.equal(updates[0]?.error_message, "customer_replied");
  });
});
