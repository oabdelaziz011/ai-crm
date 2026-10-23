import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { LeadPermissionDeniedError } from "@workspace/lead-platform";

process.env.VITE_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key-for-unit-tests";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key-for-unit-tests";

function portContext(overrides?: { companyId?: string; permissions?: Set<string> }) {
  const permissions = overrides?.permissions ?? new Set(["leads.qualify", "leads.view", "leads.edit"]);
  return {
    companyId: overrides?.companyId ?? "company-a",
    actorUserId: "user-1",
    isSuperAdmin: false,
    hasPermission: (code: string) => permissions.has(code),
  };
}

function qualifiedLead(overrides?: Record<string, unknown>) {
  return {
    id: "lead-1",
    companyId: "company-a",
    pipelineId: "pipe-1",
    stageId: "stage-qualified",
    sourceId: null,
    lifecycleStatus: "qualified",
    title: "Ada",
    contactName: "Ada",
    email: null,
    phone: "+201000000001",
    companyName: null,
    priority: "normal",
    estimatedValue: null,
    currency: "USD",
    score: 80,
    isQualified: true,
    isVip: false,
    language: null,
    territory: null,
    department: null,
    assignedUserId: null,
    customerId: null,
    conversationId: "conv-1",
    qualifiedAt: "2026-10-19T12:00:00.000Z",
    convertedAt: null,
    archivedAt: null,
    expectedCloseDate: null,
    temperature: null,
    notes: "",
    tags: [],
    lastActivityAt: null,
    aiSummary: "",
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-10-19T11:00:00.000Z",
    updatedAt: "2026-10-19T12:00:00.000Z",
    ...overrides,
  };
}

describe("createApplicationLayerLeadToolPorts.qualifyLead (P0)", () => {
  let createApplicationLayerLeadToolPorts: typeof import("./application-layer-lead-tool-ports.ts").createApplicationLayerLeadToolPorts;
  let createLeadAgentTools: typeof import("@workspace/ai-tool-router").createLeadAgentTools;

  before(async () => {
    ({ createApplicationLayerLeadToolPorts } = await import("./application-layer-lead-tool-ports.ts"));
    ({ createLeadAgentTools } = await import("@workspace/ai-tool-router"));
  });

  it("uses the authoritative lead-platform qualifyLead service", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const platform = {
      commands: {
        async qualifyLead(_ctx: unknown, input: Record<string, unknown>) {
          calls.push(input);
          return {
            lead: qualifiedLead({ score: (input.score as number) ?? 42 }),
            qualificationApplied: true,
            policy: { outcome: "qualified" },
          };
        },
      },
      queries: {},
    };
    const ports = createApplicationLayerLeadToolPorts(portContext(), {} as never, {
      platform: platform as never,
      applicationServices: { lead: {} } as never,
    });

    const result = await ports.qualifyLead({
      companyId: "company-a",
      userId: "user-1",
      leadId: "lead-1",
      score: 90,
      evidence: { explicitBuyingIntent: true },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.companyId, "company-a");
    assert.equal(calls[0]?.leadId, "lead-1");
    assert.equal(calls[0]?.score, 90);
    assert.equal(calls[0]?.qualificationPolicyMode, "enforce");
    assert.deepEqual(calls[0]?.evidence, {});
    assert.equal(result.lead.isQualified, true);
    assert.equal(result.lead.lifecycleStatus, "qualified");
    assert.equal(result.lead.qualifiedAt, "2026-10-19T12:00:00.000Z");
    assert.equal(result.lead.score, 90);
  });

  it("does not treat a score-only update as qualification (no updateLead on qualify)", async () => {
    let updateCalled = false;
    const platform = {
      commands: {
        async qualifyLead() {
          return {
            lead: qualifiedLead(),
            qualificationApplied: true,
            policy: { outcome: "qualified", reason: "policy_skipped_human_override" },
          };
        },
      },
      queries: {},
    };
    const ports = createApplicationLayerLeadToolPorts(portContext(), {} as never, {
      platform: platform as never,
      applicationServices: {
        lead: {
          async updateLead() {
            updateCalled = true;
            throw new Error("score-only qualify path must not run");
          },
        },
      } as never,
    });

    await ports.qualifyLead({
      companyId: "company-a",
      userId: "user-1",
      leadId: "lead-1",
      qualificationPolicyMode: "human_override",
    });
    assert.equal(updateCalled, false);
  });

  it("rejects cross-company qualification attempts", async () => {
    let qualifyCalled = false;
    const ports = createApplicationLayerLeadToolPorts(portContext({ companyId: "company-a" }), {} as never, {
      platform: {
        commands: {
          async qualifyLead() {
            qualifyCalled = true;
            return { lead: qualifiedLead() };
          },
        },
        queries: {},
      } as never,
      applicationServices: { lead: {} } as never,
    });

    await assert.rejects(
      () =>
        ports.qualifyLead({
          companyId: "company-b",
          userId: "user-1",
          leadId: "lead-1",
        }),
      /company\.access/,
    );
    assert.equal(qualifyCalled, false);
  });

  it("surfaces permission failures without reporting a qualified lead", async () => {
    const ports = createApplicationLayerLeadToolPorts(
      portContext({ permissions: new Set(["leads.view"]) }),
      {} as never,
      {
        platform: {
          commands: {
            async qualifyLead(ctx: { hasPermission: (code: string) => boolean }) {
              if (!ctx.hasPermission("leads.qualify")) {
                throw new LeadPermissionDeniedError("leads.qualify");
              }
              return { lead: qualifiedLead() };
            },
          },
          queries: {},
        } as never,
        applicationServices: { lead: {} } as never,
      },
    );

    await assert.rejects(
      () =>
        ports.qualifyLead({
          companyId: "company-a",
          userId: "user-1",
          leadId: "lead-1",
        }),
      /leads\.qualify/,
    );
  });

  it("qualify_lead tool returns success only when the port succeeds", async () => {
    const ports = createApplicationLayerLeadToolPorts(portContext(), {} as never, {
      platform: {
        commands: {
          async qualifyLead() {
            return {
              lead: qualifiedLead({ score: 77 }),
              qualificationApplied: true,
              policy: { outcome: "qualified" },
            };
          },
        },
        queries: {},
      } as never,
      applicationServices: { lead: {} } as never,
    });
    const tools = createLeadAgentTools(ports);
    const ok = await tools.qualify_lead!.execute(
      {
        companyId: "company-a",
        userId: "user-1",
        conversationId: "conv-1",
        conversationState: "waiting_user",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      { leadId: "lead-1", score: 77, explicitBuyingIntent: true, productInterest: true },
    );
    assert.equal(ok.success, true);
    assert.equal(ok.lead.isQualified, true);
    assert.equal(ok.lead.lifecycleStatus, "qualified");
  });

  it("qualify_lead tool does not return success when the port throws", async () => {
    const ports = createApplicationLayerLeadToolPorts(portContext(), {} as never, {
      platform: {
        commands: {
          async qualifyLead() {
            throw new Error("Lead not found: lead-missing");
          },
        },
        queries: {},
      } as never,
      applicationServices: { lead: {} } as never,
    });
    const tools = createLeadAgentTools(ports);
    await assert.rejects(
      () =>
        tools.qualify_lead!.execute(
          {
            companyId: "company-a",
            userId: "user-1",
            conversationId: "conv-1",
            conversationState: "waiting_user",
            isSuperAdmin: false,
            hasPermission: () => true,
          },
          { leadId: "lead-missing" },
        ),
      /Lead not found/,
    );
  });
});
