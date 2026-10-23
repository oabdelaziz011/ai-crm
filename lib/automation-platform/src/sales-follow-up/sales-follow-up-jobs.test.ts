import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  type SalesFollowUpSettings,
} from "./sales-follow-up.js";
import {
  processClaimedSalesFollowUpJob,
  processSalesFollowUpTick,
  type SalesFollowUpJobRecord,
} from "./sales-follow-up-jobs.js";
import type {
  SalesFollowUpAttemptRecord,
  SalesFollowUpDeliveryPort,
} from "./sales-follow-up-executor.js";

function job(overrides: Partial<SalesFollowUpJobRecord> = {}): SalesFollowUpJobRecord {
  const dueAt = new Date("2026-10-17T10:00:00.000Z");
  return {
    id: "job-1",
    companyId: "company-a",
    leadId: "lead-1",
    conversationId: "conv-1",
    companyChannelId: "ch-1",
    externalThreadId: "ext-1",
    channel: "whatsapp",
    attemptNumber: 1,
    dueAt,
    createdAt: new Date("2026-10-16T10:00:00.000Z"),
    messageText: "Following up",
    idempotencyKey: `company-a:lead-1:1`,
    status: "claimed",
    claimOwner: "worker",
    claimedAt: new Date("2026-10-17T10:01:00.000Z"),
    claimExpiresAt: new Date("2026-10-17T10:03:00.000Z"),
    lastOutcome: null,
    providerMessageId: null,
    errorMessage: null,
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
      async tryClaim(attempt: { idempotencyKey: string; companyId: string; leadId: string; channel: string | null; conversationId: string | null }) {
        if (rows.some((row) => row.idempotencyKey === attempt.idempotencyKey)) return false;
        rows.push({
          companyId: attempt.companyId,
          leadId: attempt.leadId,
          idempotencyKey: attempt.idempotencyKey,
          channel: attempt.channel as never,
          outcome: "scheduled",
          reason: "claim",
          providerMessageId: null,
          errorMessage: null,
          conversationId: attempt.conversationId,
        });
        return true;
      },
      async record(attempt: SalesFollowUpAttemptRecord) {
        const index = rows.findIndex((row) => row.idempotencyKey === attempt.idempotencyKey);
        if (index >= 0) rows[index] = attempt;
        else rows.push(attempt);
      },
    },
  };
}

const enabledSettings: SalesFollowUpSettings = {
  ...DEFAULT_SALES_FOLLOW_UP_SETTINGS,
  enabled: true,
  channels: ["whatsapp"],
  approvalMode: "automatic",
};

describe("processClaimedSalesFollowUpJob", () => {
  it("never calls the provider when allowProviderSend is false", async () => {
    let called = false;
    const { store, rows } = memoryAttempts();
    const result = await processClaimedSalesFollowUpJob({
      job: job(),
      settings: enabledSettings,
      eligibility: {
        optedOut: false,
        customerRepliedAfterSchedule: false,
        converted: false,
        purchased: false,
        requestClosed: false,
        assigneeChanged: false,
        attemptsAlreadySent: 0,
        companySentToday: 0,
        channelConnected: true,
        channelCanSend: true,
        withinBusinessHours: true,
      },
      now: new Date("2026-10-17T10:05:00.000Z"),
      allowProviderSend: false,
      delivery: {
        async deliver() {
          called = true;
          return { status: "delivered", providerMessageId: "should-not" };
        },
      },
      attempts: store,
    });
    assert.equal(called, false);
    assert.equal(result.delivered, false);
    assert.notEqual(result.recordedOutcome, "sent");
    assert.equal(rows.some((row) => row.outcome === "sent"), false);
  });

  it("records sent only after mocked provider acceptance and blocks a second claim", async () => {
    const { store, rows } = memoryAttempts();
    let calls = 0;
    const delivery: SalesFollowUpDeliveryPort = {
      async deliver() {
        calls += 1;
        return { status: "delivered", providerMessageId: "wamid.1" };
      },
    };
    const first = await processClaimedSalesFollowUpJob({
      job: job(),
      settings: enabledSettings,
      eligibility: {
        optedOut: false,
        customerRepliedAfterSchedule: false,
        converted: false,
        purchased: false,
        requestClosed: false,
        assigneeChanged: false,
        attemptsAlreadySent: 0,
        companySentToday: 0,
        channelConnected: true,
        channelCanSend: true,
        withinBusinessHours: true,
      },
      now: new Date("2026-10-17T10:05:00.000Z"),
      allowProviderSend: true,
      delivery,
      attempts: store,
    });
    assert.equal(first.delivered, true);
    assert.equal(first.providerMessageId, "wamid.1");

    const second = await processClaimedSalesFollowUpJob({
      job: job(),
      settings: enabledSettings,
      eligibility: {
        optedOut: false,
        customerRepliedAfterSchedule: false,
        converted: false,
        purchased: false,
        requestClosed: false,
        assigneeChanged: false,
        attemptsAlreadySent: 0,
        companySentToday: 0,
        channelConnected: true,
        channelCanSend: true,
        withinBusinessHours: true,
      },
      now: new Date("2026-10-17T10:05:00.000Z"),
      allowProviderSend: true,
      delivery,
      attempts: store,
    });
    assert.equal(second.delivered, false);
    assert.equal(second.recordedOutcome, "skipped");
    assert.equal(calls, 1);
    assert.equal(rows.filter((row) => row.outcome === "sent").length, 1);
  });

  it("skips disabled companies without provider send", async () => {
    let called = false;
    const result = await processClaimedSalesFollowUpJob({
      job: job(),
      settings: DEFAULT_SALES_FOLLOW_UP_SETTINGS,
      eligibility: {
        optedOut: false,
        customerRepliedAfterSchedule: false,
        converted: false,
        purchased: false,
        requestClosed: false,
        assigneeChanged: false,
        attemptsAlreadySent: 0,
        companySentToday: 0,
        channelConnected: true,
        channelCanSend: true,
        withinBusinessHours: true,
      },
      allowProviderSend: true,
      delivery: {
        async deliver() {
          called = true;
          return { status: "delivered", providerMessageId: "x" };
        },
      },
      attempts: memoryAttempts().store,
    });
    assert.equal(called, false);
    assert.equal(result.recordedOutcome, "skipped");
  });
});

describe("processSalesFollowUpTick isolation", () => {
  it("continues after one job failure", async () => {
    const jobs = [job({ id: "job-bad", leadId: "lead-bad" }), job({ id: "job-ok", leadId: "lead-ok", idempotencyKey: "other-key" })];
    let claimCalls = 0;
    const client = {
      rpc: async () => {
        claimCalls += 1;
        return {
          data: jobs.map((item) => ({
            id: item.id,
            company_id: item.companyId,
            lead_id: item.leadId,
            conversation_id: item.conversationId,
            company_channel_id: item.companyChannelId,
            external_thread_id: item.externalThreadId,
            channel: item.channel,
            attempt_number: item.attemptNumber,
            due_at: item.dueAt.toISOString(),
            message_text: item.messageText,
            idempotency_key: item.idempotencyKey,
            status: "claimed",
            claim_owner: "worker",
            claimed_at: new Date().toISOString(),
            claim_expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_outcome: null,
            provider_message_id: null,
            error_message: null,
          })),
          error: null,
        };
      },
      from: (table: string) => {
        if (table === "sales_follow_up_settings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    company_id: "company-a",
                    enabled: true,
                    channels: ["whatsapp"],
                    approval_mode: "automatic",
                    first_delay_minutes: 1440,
                    subsequent_interval_minutes: [],
                    max_attempts: 2,
                    timezone: "UTC",
                    business_hours: DEFAULT_SALES_FOLLOW_UP_SETTINGS.businessHours,
                    stop_on_customer_reply: true,
                    stop_on_conversion: true,
                    stop_on_purchase: true,
                    stop_on_opt_out: true,
                    stop_on_closed_request: true,
                    stop_on_reassignment: true,
                    company_daily_limit: 50,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "sales_follow_up_jobs") {
          return {
            update: () => ({
              eq: () => ({
                // completeSalesFollowUpJob adds .neq("status","cancelled"); release path ends at .eq().
                eq: () => {
                  const result = { error: null };
                  return Object.assign(Promise.resolve(result), { neq: async () => result });
                },
              }),
            }),
          };
        }
        return {};
      },
    };

    const { store } = memoryAttempts();
    const tick = await processSalesFollowUpTick({
      client: client as never,
      delivery: {
        async deliver() {
          return { status: "delivered", providerMessageId: "ok" };
        },
      },
      attempts: store,
      allowProviderSend: true,
      loadEligibility: async (claimedJob) => {
        if (claimedJob.leadId === "lead-bad") throw new Error("boom");
        return {
          optedOut: false,
          customerRepliedAfterSchedule: false,
          converted: false,
          purchased: false,
          requestClosed: false,
          assigneeChanged: false,
          attemptsAlreadySent: 0,
          companySentToday: 0,
          channelConnected: true,
          channelCanSend: true,
          withinBusinessHours: true,
        };
      },
      now: new Date("2026-10-17T10:05:00.000Z"),
    });

    assert.equal(claimCalls, 1);
    assert.equal(tick.claimed, 2);
    assert.equal(tick.processed, 2);
    assert.equal(tick.failures, 1);
    assert.equal(tick.delivered, 1);
  });
});
