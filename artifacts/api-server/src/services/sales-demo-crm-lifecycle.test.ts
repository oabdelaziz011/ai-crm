import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceLeadToDemoScheduled,
  completeSalesDemo,
  completeSalesDemoAsProposalSent,
  syncSalesDemoBookingCancelledToCrm,
} from "./sales-demo-crm-lifecycle.js";
import type { LeadPlatformServices, LeadRecord, LeadServiceContext } from "@workspace/lead-platform";
import type { SupabaseClient } from "@supabase/supabase-js";

function lead(overrides: Partial<LeadRecord> & Pick<LeadRecord, "id" | "lifecycleStatus" | "pipelineId">): LeadRecord {
  return {
    companyId: "co-1",
    stageId: "stage-current",
    title: "Lead",
    contactName: "A",
    email: null,
    phone: null,
    sourceId: null,
    assignedUserId: null,
    customerId: "cust-1",
    conversationId: null,
    score: 0,
    temperature: "warm",
    priority: "normal",
    expectedValue: null,
    currency: "USD",
    expectedCloseDate: null,
    isQualified: true,
    qualifiedAt: null,
    convertedAt: null,
    lostReason: null,
    notes: null,
    tags: [],
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  } as LeadRecord;
}

function ctx(): LeadServiceContext {
  return {
    userId: "user-1",
    companyId: "co-1",
    isSuperAdmin: true,
    hasPermission: () => true,
  };
}

describe("sales-demo-crm-lifecycle", () => {
  it("advances qualified → demo_scheduled via changeLeadStage", async () => {
    const stageCalls: string[] = [];
    const platform = {
      queries: {
        async listStages() {
          return {
            stages: [
              { id: "s-demo", lifecycleStatus: "demo_scheduled", pipelineId: "p1" },
              { id: "s-prop", lifecycleStatus: "proposal_sent", pipelineId: "p1" },
              { id: "s-contact", lifecycleStatus: "contacted", pipelineId: "p1" },
            ],
          };
        },
        async getLead() {
          return { lead: lead({ id: "lead-1", lifecycleStatus: "qualified", pipelineId: "p1" }) };
        },
      },
      commands: {
        async changeLeadStage(_c: LeadServiceContext, input: { stageId: string }) {
          stageCalls.push(input.stageId);
          const status =
            input.stageId === "s-demo"
              ? "demo_scheduled"
              : input.stageId === "s-contact"
                ? "contacted"
                : "proposal_sent";
          return {
            lead: lead({
              id: "lead-1",
              lifecycleStatus: status as LeadRecord["lifecycleStatus"],
              pipelineId: "p1",
              stageId: input.stageId,
            }),
          };
        },
      },
    } as unknown as LeadPlatformServices;

    const result = await advanceLeadToDemoScheduled(platform, ctx(), {
      id: "lead-1",
      lifecycleStatus: "qualified",
      pipelineId: "p1",
    });
    assert.equal(result.already, false);
    assert.equal(result.lead.lifecycleStatus, "demo_scheduled");
    assert.deepEqual(stageCalls, ["s-demo"]);
  });

  it("hops new → contacted → demo_scheduled when direct jump is forbidden", async () => {
    const stageCalls: string[] = [];
    const platform = {
      queries: {
        async listStages() {
          return {
            stages: [
              { id: "s-demo", lifecycleStatus: "demo_scheduled", pipelineId: "p1" },
              { id: "s-contact", lifecycleStatus: "contacted", pipelineId: "p1" },
            ],
          };
        },
      },
      commands: {
        async changeLeadStage(_c: LeadServiceContext, input: { stageId: string }) {
          stageCalls.push(input.stageId);
          return {
            lead: lead({
              id: "lead-1",
              lifecycleStatus: (input.stageId === "s-demo" ? "demo_scheduled" : "contacted") as LeadRecord["lifecycleStatus"],
              pipelineId: "p1",
              stageId: input.stageId,
            }),
          };
        },
      },
    } as unknown as LeadPlatformServices;

    const result = await advanceLeadToDemoScheduled(platform, ctx(), {
      id: "lead-1",
      lifecycleStatus: "new",
      pipelineId: "p1",
    });
    assert.equal(result.hoppedViaContacted, true);
    assert.deepEqual(stageCalls, ["s-contact", "s-demo"]);
    assert.equal(result.lead.lifecycleStatus, "demo_scheduled");
  });

  it("completeSalesDemo requires demo_scheduled then advances to demo_completed", async () => {
    const platform = {
      queries: {
        async getLead() {
          return {
            lead: lead({ id: "lead-1", lifecycleStatus: "demo_scheduled", pipelineId: "p1" }),
          };
        },
        async listStages() {
          return {
            stages: [{ id: "s-done", lifecycleStatus: "demo_completed", pipelineId: "p1" }],
          };
        },
      },
      commands: {
        async changeLeadStage() {
          return {
            lead: lead({
              id: "lead-1",
              lifecycleStatus: "demo_completed",
              pipelineId: "p1",
              stageId: "s-done",
            }),
          };
        },
      },
    } as unknown as LeadPlatformServices;

    const { lead: next } = await completeSalesDemo(platform, ctx(), {
      companyId: "co-1",
      leadId: "lead-1",
    });
    assert.equal(next.lifecycleStatus, "demo_completed");
  });

  it("completeSalesDemo rejects booking-only / non-demo stages", async () => {
    const platform = {
      queries: {
        async getLead() {
          return { lead: lead({ id: "lead-1", lifecycleStatus: "qualified", pipelineId: "p1" }) };
        },
      },
      commands: {},
    } as unknown as LeadPlatformServices;

    await assert.rejects(
      () =>
        completeSalesDemo(platform, ctx(), {
          companyId: "co-1",
          leadId: "lead-1",
        }),
      /demo_scheduled/,
    );
  });

  it("deprecated completeSalesDemoAsProposalSent delegates to demo_completed", async () => {
    const platform = {
      queries: {
        async getLead() {
          return {
            lead: lead({ id: "lead-1", lifecycleStatus: "demo_scheduled", pipelineId: "p1" }),
          };
        },
        async listStages() {
          return {
            stages: [{ id: "s-done", lifecycleStatus: "demo_completed", pipelineId: "p1" }],
          };
        },
      },
      commands: {
        async changeLeadStage() {
          return {
            lead: lead({
              id: "lead-1",
              lifecycleStatus: "demo_completed",
              pipelineId: "p1",
              stageId: "s-done",
            }),
          };
        },
      },
    } as unknown as LeadPlatformServices;

    const { lead: next } = await completeSalesDemoAsProposalSent(platform, ctx(), {
      companyId: "co-1",
      leadId: "lead-1",
    });
    assert.equal(next.lifecycleStatus, "demo_completed");
  });

  it("cancel sync reverts demo_scheduled → contacted and never completes", async () => {
    const stageCalls: string[] = [];
    const platform = {
      queries: {
        async getLead() {
          return {
            lead: lead({ id: "lead-1", lifecycleStatus: "demo_scheduled", pipelineId: "p1" }),
          };
        },
        async listStages() {
          return {
            stages: [
              { id: "s-contact", lifecycleStatus: "contacted", pipelineId: "p1" },
              { id: "s-demo", lifecycleStatus: "demo_scheduled", pipelineId: "p1" },
            ],
          };
        },
      },
      commands: {
        async changeLeadStage(_c: LeadServiceContext, input: { stageId: string }) {
          stageCalls.push(input.stageId);
          return {
            lead: lead({
              id: "lead-1",
              lifecycleStatus: "contacted",
              pipelineId: "p1",
              stageId: input.stageId,
            }),
          };
        },
      },
    } as unknown as LeadPlatformServices;

    const client = {
      from(table: string) {
        if (table === "scheduling_bookings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        is() {
                          return {
                            async maybeSingle() {
                              return {
                                data: {
                                  id: "bk-1",
                                  customer_id: "cust-1",
                                  lead_id: "lead-1",
                                  service_id: "svc-demo",
                                },
                                error: null,
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "scheduling_services") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: { service_kind: "sales_demo" }, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "product_demo_bookings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        is() {
                          return {
                            async maybeSingle() {
                              return { data: null, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const result = await syncSalesDemoBookingCancelledToCrm(
      client,
      { companyId: "co-1", userId: "user-1", bookingId: "bk-1" },
      () => platform,
    );
    assert.equal(result.ok, true);
    assert.equal(result.lifecycleStatus, "contacted");
    assert.deepEqual(stageCalls, ["s-contact"]);
    assert.notEqual(result.lifecycleStatus, "proposal_sent");
  });

  it("book/cancel/reschedule paths never invoke completeSalesDemo", async () => {
    // Regression guard: completion is helper-only and must not be wired into booking lifecycle.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./sales-demo-crm-lifecycle.ts", import.meta.url), "utf8"),
    );
    assert.equal(source.includes("syncSalesDemoBookingToCrm"), true);
    assert.equal(source.includes("syncSalesDemoBookingCancelledToCrm"), true);
    assert.equal(source.includes("syncSalesDemoBookingRescheduledToCrm"), true);
    const syncSection = source.slice(source.indexOf("export async function syncSalesDemoBookingToCrm"));
    assert.equal(/\bcompleteSalesDemo\s*\(/.test(syncSection), false);
    assert.equal(/changeToLifecycle\([^)]*proposal_sent/.test(syncSection), false);
    assert.equal(/changeToLifecycle\([^)]*demo_completed/.test(syncSection), false);
  });

  it("cancel sync no-ops for operational bookings", async () => {
    const platform = {
      queries: {},
      commands: {
        async changeLeadStage() {
          throw new Error("must not change stage for operational cancel");
        },
      },
    } as unknown as LeadPlatformServices;

    const client = {
      from(table: string) {
        if (table === "scheduling_bookings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        is() {
                          return {
                            async maybeSingle() {
                              return {
                                data: {
                                  id: "bk-op",
                                  customer_id: "cust-1",
                                  lead_id: "lead-1",
                                  service_id: "svc-op",
                                },
                                error: null,
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "scheduling_services") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: { service_kind: "operational" }, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        if (table === "product_demo_bookings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        is() {
                          return {
                            async maybeSingle() {
                              return { data: null, error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as unknown as SupabaseClient;

    const result = await syncSalesDemoBookingCancelledToCrm(
      client,
      { companyId: "co-1", userId: "user-1", bookingId: "bk-op" },
      () => platform,
    );
    assert.equal(result.ok, true);
    assert.equal(result.reason, "not_sales_demo");
  });
});
