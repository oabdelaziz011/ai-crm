import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleSalesFollowUpLeadLifecycleEvent } from "./sales-follow-up-lifecycle.js";

function mockClient(options: {
  settings?: Record<string, unknown>;
  cancelCount?: number;
}) {
  const cancelledReasons: string[] = [];
  return {
    cancelledReasons,
    client: {
      from(table: string) {
        if (table === "sales_follow_up_settings") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return {
                data: {
                  company_id: "c1",
                  enabled: true,
                  channels: ["whatsapp"],
                  first_delay_minutes: 1440,
                  subsequent_interval_minutes: [4320, 10080],
                  max_attempts: 3,
                  timezone: "UTC",
                  business_hours: { start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
                  approval_mode: "automatic",
                  stop_on_customer_reply: true,
                  stop_on_conversion: true,
                  stop_on_purchase: true,
                  stop_on_opt_out: true,
                  stop_on_closed_request: true,
                  stop_on_reassignment: true,
                  company_daily_limit: 50,
                  ...options.settings,
                },
                error: null,
              };
            },
          };
        }
        if (table === "sales_follow_up_jobs") {
          return {
            update(payload: Record<string, unknown>) {
              cancelledReasons.push(String(payload.error_message ?? ""));
              return {
                eq() {
                  return this;
                },
                in() {
                  return this;
                },
                async select() {
                  const n = options.cancelCount ?? 1;
                  return {
                    data: Array.from({ length: n }, (_, i) => ({ id: `j${i}` })),
                    error: null,
                  };
                },
              };
            },
          };
        }
        if (table === "leads") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return { data: { id: "lead-1", conversation_id: null }, error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe("handleSalesFollowUpLeadLifecycleEvent", () => {
  it("cancels on convert, disqualify, and reassign when policy allows", async () => {
    for (const type of ["lead_converted", "lead_disqualified", "lead_reassigned"] as const) {
      const { client, cancelledReasons } = mockClient({ cancelCount: 2 });
      const result = await handleSalesFollowUpLeadLifecycleEvent(client as never, {
        type,
        companyId: "c1",
        leadId: "lead-1",
      });
      assert.equal(result.action, "cancel", type);
      assert.match(String(result.detail), /cancelled=2/);
      assert.equal(cancelledReasons.length, 1);
    }
  });

  it("respects stopOnReassignment=false", async () => {
    const { client, cancelledReasons } = mockClient({
      settings: { stop_on_reassignment: false },
    });
    const result = await handleSalesFollowUpLeadLifecycleEvent(client as never, {
      type: "lead_reassigned",
      companyId: "c1",
      leadId: "lead-1",
    });
    assert.equal(result.action, "skipped");
    assert.equal(cancelledReasons.length, 0);
  });

  it("skips schedule when automation disabled on qualify", async () => {
    const { client } = mockClient({ settings: { enabled: false } });
    const result = await handleSalesFollowUpLeadLifecycleEvent(client as never, {
      type: "lead_qualified",
      companyId: "c1",
      leadId: "lead-1",
    });
    assert.equal(result.action, "skipped");
    assert.equal(result.detail, "automation_disabled");
  });
});
