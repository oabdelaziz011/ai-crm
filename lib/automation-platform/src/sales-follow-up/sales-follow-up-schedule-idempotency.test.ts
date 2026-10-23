import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scheduleSalesFollowUpLadder } from "./sales-follow-up-orchestrate.js";
import { DEFAULT_SALES_FOLLOW_UP_SETTINGS } from "./sales-follow-up.js";

function mockClientWithActiveJobs(activeCount: number) {
  return {
    from(table: string) {
      if (table === "sales_follow_up_jobs") {
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.then = (resolve: (v: unknown) => unknown) =>
          resolve({ count: activeCount, error: null });
        // head count path awaits the builder
        Object.assign(builder, {
          then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve({ count: activeCount, error: null }).then(resolve, reject),
        });
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("scheduleSalesFollowUpLadder idempotency", () => {
  it("skips when pending/claimed jobs already exist for the lead", async () => {
    const result = await scheduleSalesFollowUpLadder(
      mockClientWithActiveJobs(2) as never,
      {
        companyId: "co-1",
        leadId: "lead-1",
        conversationId: "conv-1",
        channel: "whatsapp",
        companyChannelId: "ch-1",
        externalThreadId: "201001234567",
      },
      {
        ...DEFAULT_SALES_FOLLOW_UP_SETTINGS,
        companyId: "co-1",
        enabled: true,
        channels: ["whatsapp"],
      },
    );
    assert.equal(result.scheduled, false);
    assert.equal(result.reason, "already_scheduled");
    assert.equal(result.createdCount, 0);
  });
});

describe("enqueue active attempt uniqueness", () => {
  it("reuses an active pending job for the same attempt even when dueAt differs", async () => {
    const { enqueueSalesFollowUpJob } = await import("./sales-follow-up-jobs.js");
    const existing = {
      id: "job-1",
      company_id: "co-1",
      lead_id: "lead-1",
      conversation_id: "conv-1",
      company_channel_id: "ch-1",
      external_thread_id: "201001234567",
      channel: "whatsapp",
      attempt_number: 1,
      due_at: "2026-10-18T10:00:00.000Z",
      message_text: "",
      idempotency_key: "old-key",
      status: "pending",
      claim_owner: null,
      claimed_at: null,
      claim_expires_at: null,
      last_outcome: null,
      provider_message_id: null,
      error_message: null,
      created_at: "2026-10-17T10:00:00.000Z",
      updated_at: "2026-10-17T10:00:00.000Z",
    };
    let inserted = false;
    const client = {
      from() {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        for (const method of ["select", "eq", "in", "order", "limit", "insert"]) {
          builder[method] = (..._args: unknown[]) => {
            if (method === "insert") inserted = true;
            return builder;
          };
        }
        builder.maybeSingle = async () => {
          if (inserted) return { data: null, error: null };
          return { data: existing, error: null };
        };
        return builder;
      },
    };
    const result = await enqueueSalesFollowUpJob(client as never, {
      companyId: "co-1",
      leadId: "lead-1",
      conversationId: "conv-1",
      companyChannelId: "ch-1",
      externalThreadId: "201001234567",
      channel: "whatsapp",
      attemptNumber: 1,
      dueAt: new Date("2026-10-20T10:00:00.000Z"),
      messageText: "",
    });
    assert.equal(result.created, false);
    assert.equal(result.job?.id, "job-1");
    assert.equal(inserted, false);
  });
});
