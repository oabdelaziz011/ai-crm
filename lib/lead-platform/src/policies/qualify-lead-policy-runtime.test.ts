import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeadCommandService } from "../services/lead-command-service.js";
import { LeadQualificationPolicyRejectedError } from "../errors.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import type { LeadRecord } from "../types/lead-types.js";
import { InMemoryCompanyLeadQualificationSettingsStore } from "./company-lead-qualification-settings.js";

function createMemoryRepo(overrides?: Partial<LeadRecord>): LeadRepository {
  const leads = new Map<string, LeadRecord>();
  const pipelineId = "pipe-1";

  const baseLead = (): LeadRecord => ({
    id: "lead-1",
    companyId: "company-1",
    pipelineId,
    stageId: "stage-new",
    sourceId: null,
    lifecycleStatus: "new",
    title: "Test Lead",
    contactName: "Jane",
    email: "jane@example.com",
    phone: "+201000000001",
    companyName: null,
    priority: "normal",
    estimatedValue: 1000,
    currency: "USD",
    score: 0,
    isQualified: false,
    isVip: false,
    language: null,
    territory: null,
    department: null,
    assignedUserId: null,
    customerId: null,
    conversationId: null,
    qualifiedAt: null,
    convertedAt: null,
    archivedAt: null,
    expectedCloseDate: null,
    temperature: null,
    notes: "",
    tags: [],
    lastActivityAt: new Date().toISOString(),
    aiSummary: "",
    metadata: {},
    createdBy: "user-1",
    updatedBy: "user-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  return {
    ensureDefaultPipeline: async () => pipelineId,
    getDefaultStage: async () => ({
      id: "stage-new",
      companyId: "company-1",
      pipelineId,
      name: "New",
      slug: "new",
      lifecycleStatus: "new",
      sortOrder: 0,
      probabilityPercent: 5,
      isTerminal: false,
    }),
    createLead: async (input) => {
      const record = { ...baseLead(), ...input, id: "lead-1", title: input.title };
      leads.set(record.id, record as LeadRecord);
      return record as LeadRecord;
    },
    updateLead: async (input) => {
      const existing = leads.get(input.leadId)!;
      const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
      leads.set(input.leadId, updated as LeadRecord);
      return updated as LeadRecord;
    },
    softDeleteLead: async () => {},
    getLead: async (_c, id) => leads.get(id) ?? null,
    getLeadByConversation: async () => null,
    getLeadByCustomer: async () => null,
    searchLeads: async () => ({ leads: [], total: 0 }),
    listPipelines: async () => [],
    getPipeline: async () => ({
      id: pipelineId,
      companyId: "company-1",
      name: "Default",
      slug: "default",
      description: "",
      isDefault: true,
      isActive: true,
      allowBackwardStageMovement: true,
    }),
    listStages: async () => [
      {
        id: "stage-qualified",
        companyId: "company-1",
        pipelineId,
        name: "Qualified",
        slug: "qualified",
        lifecycleStatus: "qualified" as const,
        sortOrder: 1,
        probabilityPercent: 20,
        isTerminal: false,
      },
    ],
    getStage: async (_c, id) => {
      if (id === "stage-qualified") {
        return {
          id: "stage-qualified",
          companyId: "company-1",
          pipelineId,
          name: "Qualified",
          slug: "qualified",
          lifecycleStatus: "qualified",
          sortOrder: 1,
          probabilityPercent: 20,
          isTerminal: false,
        };
      }
      if (id === "stage-contacted") {
        return {
          id: "stage-contacted",
          companyId: "company-1",
          pipelineId,
          name: "Contacted",
          slug: "contacted",
          lifecycleStatus: "contacted",
          sortOrder: 2,
          probabilityPercent: 35,
          isTerminal: false,
        };
      }
      return {
        id: "stage-new",
        companyId: "company-1",
        pipelineId,
        name: "New",
        slug: "new",
        lifecycleStatus: "new",
        sortOrder: 0,
        probabilityPercent: 5,
        isTerminal: false,
      };
    },
    listSources: async () => [],
    ensureDefaultSources: async () => [],
    createAssignment: async (input) => ({
      id: "assign-1",
      companyId: input.companyId,
      leadId: input.leadId,
      assignedUserId: input.assignedUserId,
      assignmentMethod: input.assignmentMethod,
      assignedBy: input.assignedBy,
      isActive: true,
      assignedAt: new Date().toISOString(),
    }),
    deactivateAssignments: async () => {},
    addNote: async () => ({
      id: "n1",
      companyId: "company-1",
      leadId: "lead-1",
      body: "",
      isInternal: true,
      createdBy: "user-1",
      createdAt: new Date().toISOString(),
    }),
    addTag: async () => ({
      id: "t1",
      companyId: "company-1",
      leadId: "lead-1",
      tag: "x",
      createdAt: new Date().toISOString(),
    }),
    removeTag: async () => {},
    listTags: async () => [],
    listNotes: async () => [],
    appendActivity: async (input) => ({
      id: "a1",
      companyId: input.companyId,
      leadId: input.leadId,
      activityType: input.activityType,
      summary: input.summary,
      payload: {},
      actorUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    }),
    appendHistory: async (input) => ({
      id: "h1",
      companyId: input.companyId,
      leadId: input.leadId,
      fieldName: input.fieldName,
      previousValue: input.previousValue,
      newValue: input.newValue,
      changeAction: input.changeAction,
      actorUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    }),
    listActivities: async () => [],
    listHistory: async () => [],
    recordConversion: async () => {},
    mergeLeads: async (input) => leads.get(input.primaryLeadId)!,
    fetchMetrics: async () => ({
      totalLeads: 1,
      leadsByStatus: {},
      pipelineMetrics: [],
      conversionsInPeriod: 0,
      createdInPeriod: 1,
      averageScore: 0,
      conversionRate: 0,
    }),
    claimLeadForConversion: async () => ({ claimed: true }),
    releaseLeadConversionClaim: async () => {},
  } as unknown as LeadRepository;
}

function buildService(repo = createMemoryRepo(), store?: InMemoryCompanyLeadQualificationSettingsStore) {
  const events: string[] = [];
  const service = new LeadCommandService({
    leads: repo,
    assignees: {
      resolveAssigneeLabel: async (id) => id,
      loadAssigneeLabels: async (ids) => new Map(ids.map((id) => [id, id])),
      listAssigneeCandidates: async () => [],
    },
    conversion: { convertLead: async () => ({ customerId: "cust-1" }) },
    events: {
      publish: async (event) => {
        events.push(event.type);
      },
    },
    notifications: { notify: async () => {} },
    audit: { write: async () => {} },
    qualificationSettingsStore: store ?? null,
  });
  return { service, repo, events };
}

const ctx = {
  userId: "user-1",
  companyId: "company-1",
  isSuperAdmin: false,
  hasPermission: () => true,
};

describe("P1c qualifyLead policy runtime", () => {
  it("B2C success with explicit buying intent + observational contact/interest", async () => {
    const repo = createMemoryRepo({
      metadata: { productInterest: { productId: "prod-1", productName: "Widget" } },
    });
    const { service, events } = buildService(repo);
    await service.createLead(ctx, { companyId: "company-1", title: "B2C" });
    // recreate with metadata — createLead overwrote; set via update
    await repo.updateLead({
      companyId: "company-1",
      leadId: "lead-1",
      metadata: { productInterest: { productId: "prod-1", productName: "Widget" } },
    });

    const result = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "enforce",
      evidence: {
        explicitBuyingIntent: true,
        productInterest: true,
        contactAvailable: true,
      },
      companySettingsPatch: { salesMotion: "b2c" },
    });
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.lead.isQualified, true);
    assert.ok(result.lead.qualifiedAt);
    assert.equal(result.policy.outcome, "qualified");
    assert.ok(events.includes("lead_qualified"));
  });

  it("B2B success with stated need + buying intent", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "B2B" });
    const result = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "enforce",
      evidence: {
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
      },
      companySettingsPatch: { salesMotion: "b2b" },
    });
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.policy.outcome, "qualified");
  });

  it("rejects missing required evidence without writing CRM", async () => {
    const { service, repo, events } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Incomplete" });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          qualificationPolicyMode: "enforce",
          evidence: { explicitBuyingIntent: true },
          companySettingsPatch: { salesMotion: "b2c" },
        }),
      (err: unknown) =>
        err instanceof LeadQualificationPolicyRejectedError &&
        err.evaluation.outcome === "needs_more_information",
    );
    const lead = await repo.getLead("company-1", "lead-1");
    assert.equal(lead?.isQualified, false);
    assert.equal(events.includes("lead_qualified"), false);
  });

  it("product interest alone does not qualify under enforce", async () => {
    const repo = createMemoryRepo({
      metadata: { productInterest: { productId: "prod-1" } },
    });
    const { service } = buildService(repo);
    await service.createLead(ctx, { companyId: "company-1", title: "Interest" });
    await repo.updateLead({
      companyId: "company-1",
      leadId: "lead-1",
      metadata: { productInterest: { productId: "prod-1" } },
    });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          qualificationPolicyMode: "enforce",
          evidence: {},
          companySettingsPatch: { salesMotion: "b2c" },
        }),
      (err: unknown) =>
        err instanceof LeadQualificationPolicyRejectedError &&
        err.evaluation.outcome === "interested_not_qualified",
    );
  });

  it("requires_human_review blocks qualification", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Conflict" });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          qualificationPolicyMode: "enforce",
          evidence: {
            productInterest: true,
            explicitBuyingIntent: true,
            conflictingSignals: true,
          },
          companySettingsPatch: { salesMotion: "b2c" },
        }),
      (err: unknown) =>
        err instanceof LeadQualificationPolicyRejectedError &&
        err.evaluation.outcome === "requires_human_review",
    );
  });

  it("not_a_fit blocks qualification", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "NoFit" });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          qualificationPolicyMode: "enforce",
          evidence: {
            productInterest: true,
            explicitBuyingIntent: true,
            notAFit: true,
          },
          companySettingsPatch: { salesMotion: "b2c" },
        }),
      (err: unknown) =>
        err instanceof LeadQualificationPolicyRejectedError && err.evaluation.outcome === "not_a_fit",
    );
  });

  it("already-qualified returns idempotent already_qualified without re-emit", async () => {
    const { service, events } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Dup" });
    await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "human_override",
    });
    events.length = 0;
    const second = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "enforce",
      evidence: { productInterest: true, explicitBuyingIntent: true },
      companySettingsPatch: { salesMotion: "b2c" },
    });
    assert.equal(second.qualificationApplied, false);
    assert.equal(second.policy.outcome, "already_qualified");
    assert.equal(events.includes("lead_qualified"), false);
  });

  it("Kanban human_override still qualifies without evidence", async () => {
    const { service, events } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Kanban" });
    const moved = await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-qualified",
    });
    assert.equal(moved.lead.isQualified, true);
    assert.ok(events.includes("lead_qualified"));
  });

  it("legacy caller without evidence property uses human_override compatibility", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Legacy" });
    // No evidence key, no mode → legacy human_override
    const result = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
    });
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.policy.reason, "policy_skipped_legacy_caller");
  });

  it("company settings isolation via in-memory store", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    await store.upsert("company-1", {
      salesMotion: "b2b",
      requiredEvidenceFields: ["statedNeed", "explicitBuyingIntent", "contactAvailable", "companyIdentified"],
    });
    const { service } = buildService(createMemoryRepo(), store);
    await service.createLead(ctx, { companyId: "company-1", title: "Tenant" });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          qualificationPolicyMode: "enforce",
          evidence: { statedNeed: true, explicitBuyingIntent: true },
        }),
      (err: unknown) =>
        err instanceof LeadQualificationPolicyRejectedError &&
        err.evaluation.missingRequiredEvidence.includes("companyIdentified"),
    );
  });

  it("permission failure does not qualify", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Perm" });
    await assert.rejects(
      () =>
        service.qualifyLead(
          { ...ctx, hasPermission: () => false },
          {
            companyId: "company-1",
            leadId: "lead-1",
            qualificationPolicyMode: "human_override",
          },
        ),
      /leads\.qualify/,
    );
  });

  it("empty evidence object enforces policy (does not invent buying intent)", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "EmptyEv" });
    await assert.rejects(
      () =>
        service.qualifyLead(ctx, {
          companyId: "company-1",
          leadId: "lead-1",
          evidence: {},
          companySettingsPatch: { salesMotion: "b2c" },
        }),
      LeadQualificationPolicyRejectedError,
    );
  });

  it("P1d: qualifyLead consumes persisted store settings without companySettingsPatch", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    await store.upsert("company-1", {
      salesMotion: "b2b",
      requiredEvidenceFields: [
        "statedNeed",
        "explicitBuyingIntent",
        "contactAvailable",
        "companyIdentified",
      ],
    });
    const repo = createMemoryRepo({
      phone: "+201000000001",
      companyName: "Acme LLC",
    });
    const { service } = buildService(repo, store);
    await service.createLead(ctx, {
      companyId: "company-1",
      title: "Persisted",
      phone: "+201000000001",
      companyName: "Acme LLC",
    });
    const result = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "enforce",
      evidence: {
        statedNeed: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
        companyIdentified: true,
      },
    });
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.policy.outcome, "qualified");
    assert.equal(result.policy.salesMotion, "b2b");
  });

  it("P1d: upsertLeadQualificationSettings requires leads.manage and scopes company", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    const { service } = buildService(createMemoryRepo(), store);
    await assert.rejects(
      () =>
        service.upsertLeadQualificationSettings(
          { ...ctx, hasPermission: (code) => code === "leads.qualify" },
          { companyId: "company-1", patch: { salesMotion: "mixed" } },
        ),
      /leads\.manage/,
    );
    await assert.rejects(
      () =>
        service.upsertLeadQualificationSettings(ctx, {
          companyId: "company-other",
          patch: { salesMotion: "b2b" },
        }),
      /company\.access/,
    );
    const saved = await service.upsertLeadQualificationSettings(ctx, {
      companyId: "company-1",
      patch: { salesMotion: "mixed" },
    });
    assert.equal(saved.settings.salesMotion, "mixed");
    assert.equal(saved.settings.companyId, "company-1");
    const loaded = await service.getLeadQualificationSettings(ctx, { companyId: "company-1" });
    assert.equal(loaded.settings.salesMotion, "mixed");
  });

  it("P1d: missing store settings resolve to defaults at qualify time", async () => {
    const store = new InMemoryCompanyLeadQualificationSettingsStore();
    const repo = createMemoryRepo({ phone: "+201000000001" });
    const { service } = buildService(repo, store);
    await service.createLead(ctx, {
      companyId: "company-1",
      title: "Defaults",
      phone: "+201000000001",
    });
    const result = await service.qualifyLead(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      qualificationPolicyMode: "enforce",
      evidence: {
        productInterest: true,
        explicitBuyingIntent: true,
        contactAvailable: true,
      },
    });
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.policy.salesMotion, "b2c");
  });
});
