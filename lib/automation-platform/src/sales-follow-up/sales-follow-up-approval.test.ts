import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approveAndSendSalesFollowUpDraft,
  invalidateSalesFollowUpDraftsForConversation,
  rejectSalesFollowUpDraft,
  updateSalesFollowUpDraftMessage,
} from "./sales-follow-up-approval.js";
import { DEFAULT_SALES_FOLLOW_UP_SETTINGS } from "./sales-follow-up.js";
import type { SalesFollowUpEligibilitySnapshot } from "./sales-follow-up-jobs.js";

type Row = Record<string, unknown>;

function mockClient(state: {
  jobs: Row[];
  attempts: Row[];
  settings?: Row | null;
}) {
  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    let filters: Array<(row: Row) => boolean> = [];
    let pendingUpdate: Row | null = null;
    let limitN: number | null = null;
    let wantSingle = false;

    const match = (row: Row) => filters.every((fn) => fn(row));

    const runSelect = () => {
      const rows =
        table === "sales_follow_up_jobs"
          ? state.jobs.filter(match)
          : table === "sales_follow_up_attempts"
            ? state.attempts.filter(match)
            : table === "sales_follow_up_settings"
              ? state.settings
                ? [state.settings]
                : []
              : table === "leads"
                ? []
                : [];
      const sliced = limitN != null ? rows.slice(0, limitN) : rows;
      if (wantSingle) {
        return { data: sliced[0] ?? null, error: null };
      }
      return { data: sliced, error: null };
    };

    const applyUpdate = () => {
      const target =
        table === "sales_follow_up_jobs"
          ? state.jobs
          : table === "sales_follow_up_attempts"
            ? state.attempts
            : null;
      if (!target || !pendingUpdate) return { data: null, error: null };
      const matched = target.filter(match);
      for (const row of matched) {
        Object.assign(row, pendingUpdate);
      }
      if (wantSingle) {
        return { data: matched[0] ?? null, error: null };
      }
      return { data: matched, error: null };
    };

    const finish = () => (pendingUpdate ? applyUpdate() : runSelect());

    api.select = () => api;
    api.update = (patch: Row) => {
      pendingUpdate = patch;
      return api;
    };
    api.eq = (col: string, val: unknown) => {
      filters.push((row) => row[col] === val);
      return api;
    };
    api.is = (col: string, val: null) => {
      filters.push((row) => row[col] == null);
      return api;
    };
    api.in = (col: string, vals: unknown[]) => {
      filters.push((row) => vals.includes(row[col]));
      return api;
    };
    api.or = () => api;
    api.order = () => api;
    api.limit = (n: number) => {
      limitN = n;
      return api;
    };
    api.maybeSingle = async () => {
      wantSingle = true;
      return finish();
    };
    api.single = async () => {
      wantSingle = true;
      return finish();
    };
    // thenable for await client.from().update().eq()...
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(finish()).then(resolve, reject);

    return api;
  };

  return { from } as never;
}

const eligible: SalesFollowUpEligibilitySnapshot = {
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

function draftJob(overrides: Row = {}): Row {
  return {
    id: "job-1",
    company_id: "co-1",
    lead_id: "lead-1",
    conversation_id: "conv-1",
    company_channel_id: "ch-1",
    external_thread_id: "thread-1",
    channel: "whatsapp",
    attempt_number: 1,
    due_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    message_text: "Hi — still interested in the Pro plan?",
    idempotency_key: "key-1",
    status: "completed",
    claim_owner: null,
    claimed_at: null,
    claim_expires_at: null,
    last_outcome: "draft",
    provider_message_id: null,
    error_message: "approval_required",
    ...overrides,
  };
}

describe("sales follow-up approval", () => {
  it("invalidates completed drafts on customer reply without deleting history", async () => {
    const state = {
      jobs: [
        draftJob(),
        draftJob({ id: "job-sent", last_outcome: "sent", message_text: "sent already" }),
      ],
      attempts: [
        {
          company_id: "co-1",
          idempotency_key: "key-1",
          outcome: "draft",
          reason: "approval_required",
        },
      ],
    };
    const client = mockClient(state);
    const n = await invalidateSalesFollowUpDraftsForConversation(client, {
      companyId: "co-1",
      conversationId: "conv-1",
      reason: "customer_replied",
    });
    assert.equal(n, 1);
    assert.equal(state.jobs[0]!.last_outcome, "cancelled");
    assert.equal(state.jobs[0]!.error_message, "customer_replied");
    assert.equal(state.jobs[1]!.last_outcome, "sent");
    assert.equal(state.attempts[0]!.outcome, "cancelled");
  });

  it("rejects a draft and marks attempt cancelled", async () => {
    const state = {
      jobs: [draftJob()],
      attempts: [{ company_id: "co-1", idempotency_key: "key-1", outcome: "draft" }],
    };
    const result = await rejectSalesFollowUpDraft(mockClient(state), {
      companyId: "co-1",
      jobId: "job-1",
      actorUserId: "user-1",
      reason: "not_relevant",
    });
    assert.equal(result.rejected, true);
    assert.equal(state.jobs[0]!.status, "cancelled");
    assert.equal(state.jobs[0]!.last_outcome, "cancelled");
  });

  it("updates draft message only while awaiting review", async () => {
    const state = { jobs: [draftJob()], attempts: [] };
    const ok = await updateSalesFollowUpDraftMessage(mockClient(state), {
      companyId: "co-1",
      jobId: "job-1",
      actorUserId: "user-1",
      messageText: "Updated draft body",
    });
    assert.equal(ok.updated, true);
    assert.equal(state.jobs[0]!.message_text, "Updated draft body");

    state.jobs[0]!.last_outcome = "sent";
    const blocked = await updateSalesFollowUpDraftMessage(mockClient(state), {
      companyId: "co-1",
      jobId: "job-1",
      actorUserId: "user-1",
      messageText: "Should not apply",
    });
    assert.equal(blocked.updated, false);
  });

  it("approves and sends when eligible; refuses when customer already replied", async () => {
    const state = {
      jobs: [draftJob()],
      attempts: [{ company_id: "co-1", idempotency_key: "key-1", outcome: "draft" }],
      settings: {
        company_id: "co-1",
        enabled: true,
        channels: ["whatsapp"],
        approval_mode: "draft",
        stop_on_customer_reply: true,
        first_delay_minutes: 1440,
        subsequent_interval_minutes: [4320, 10080],
        max_attempts: 3,
        timezone: "UTC",
        business_hours: DEFAULT_SALES_FOLLOW_UP_SETTINGS.businessHours,
        stop_on_conversion: true,
        stop_on_purchase: true,
        stop_on_opt_out: true,
        stop_on_closed_request: true,
        stop_on_reassignment: true,
        company_daily_limit: 50,
      },
    };

    const deliveries: string[] = [];
    const attempts = {
      async hasIdempotencyKey() {
        return true;
      },
      async getDeliveryState() {
        return { exists: true, outcome: "draft", providerMessageId: null };
      },
      async record(row: { outcome: string }) {
        state.attempts[0]!.outcome = row.outcome;
      },
    };

    const sent = await approveAndSendSalesFollowUpDraft({
      client: mockClient(state),
      companyId: "co-1",
      jobId: "job-1",
      actorUserId: "user-1",
      allowProviderSend: true,
      delivery: {
        async deliver(input) {
          deliveries.push(input.text);
          return { status: "delivered", providerMessageId: "prov-1" };
        },
      },
      attempts: attempts as never,
      loadEligibility: async () => eligible,
    });
    assert.equal(sent.ok, true);
    assert.equal(deliveries.length, 1);
    assert.equal(state.jobs[0]!.last_outcome, "sent");
    assert.equal(state.attempts[0]!.outcome, "sent");

    // Fresh draft that becomes stale after customer reply.
    state.jobs = [draftJob({ id: "job-2", idempotency_key: "key-2" })];
    state.attempts = [{ company_id: "co-1", idempotency_key: "key-2", outcome: "draft" }];
    const stale = await approveAndSendSalesFollowUpDraft({
      client: mockClient(state),
      companyId: "co-1",
      jobId: "job-2",
      actorUserId: "user-1",
      allowProviderSend: true,
      delivery: {
        async deliver() {
          throw new Error("must not send");
        },
      },
      attempts: attempts as never,
      loadEligibility: async () => ({ ...eligible, customerRepliedAfterSchedule: true }),
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.reason, "customer_replied");
    assert.equal(state.jobs[0]!.last_outcome, "cancelled");
  });

  it("does not send when provider send is disabled by environment", async () => {
    const state = {
      jobs: [draftJob()],
      attempts: [],
      settings: { company_id: "co-1", enabled: true, channels: ["whatsapp"], approval_mode: "draft" },
    };
    const result = await approveAndSendSalesFollowUpDraft({
      client: mockClient(state),
      companyId: "co-1",
      jobId: "job-1",
      actorUserId: "user-1",
      allowProviderSend: false,
      delivery: {
        async deliver() {
          throw new Error("must not send");
        },
      },
      attempts: {
        async hasIdempotencyKey() {
          return false;
        },
        async record() {},
      } as never,
      loadEligibility: async () => eligible,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "provider_send_disabled");
    assert.equal(state.jobs[0]!.last_outcome, "draft");
  });
});
