import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import type { LeadRecord } from "../types/lead-types.js";

function createMemoryRepo(): LeadRepository {
  const leads = new Map<string, LeadRecord>();
  let pipelineId = "pipe-1";
  let stageId = "stage-new";

  const baseLead = (): LeadRecord => ({
    id: "lead-1",
    companyId: "company-1",
    pipelineId,
    stageId,
    sourceId: null,
    lifecycleStatus: "new",
    title: "Test Lead",
    contactName: "Jane",
    email: "jane@example.com",
    phone: null,
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
  });

  return {
    ensureDefaultPipeline: async () => pipelineId,
    getDefaultStage: async () => ({
      id: stageId,
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
    getLeadByConversation: async (_c, conversationId) =>
      [...leads.values()].find((lead) => lead.conversationId === conversationId) ?? null,
    getLeadByCustomer: async (_c, customerId) =>
      [...leads.values()].find((lead) => lead.customerId === customerId) ?? null,
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
    listStages: async () => [],
    getStage: async (_c, id) => {
      const stages: Record<
        string,
        {
          id: string;
          companyId: string;
          pipelineId: string;
          name: string;
          slug: string;
          lifecycleStatus: LeadRecord["lifecycleStatus"];
          sortOrder: number;
          probabilityPercent: number;
          isTerminal: boolean;
        }
      > = {
        "stage-new": {
          id: "stage-new",
          companyId: "company-1",
          pipelineId,
          name: "New",
          slug: "new",
          lifecycleStatus: "new",
          sortOrder: 0,
          probabilityPercent: 5,
          isTerminal: false,
        },
        "stage-qualified": {
          id: "stage-qualified",
          companyId: "company-1",
          pipelineId,
          name: "Qualified",
          slug: "qualified",
          lifecycleStatus: "qualified",
          sortOrder: 1,
          probabilityPercent: 20,
          isTerminal: false,
        },
        "stage-contacted": {
          id: "stage-contacted",
          companyId: "company-1",
          pipelineId,
          name: "Contacted",
          slug: "contacted",
          lifecycleStatus: "contacted",
          sortOrder: 2,
          probabilityPercent: 35,
          isTerminal: false,
        },
        "stage-proposal": {
          id: "stage-proposal",
          companyId: "company-1",
          pipelineId,
          name: "Proposal Sent",
          slug: "proposal_sent",
          lifecycleStatus: "proposal_sent",
          sortOrder: 4,
          probabilityPercent: 60,
          isTerminal: false,
        },
      };
      return stages[id] ?? null;
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
    addNote: async (input) => ({
      id: "note-1",
      companyId: input.companyId,
      leadId: input.leadId,
      body: input.body,
      isInternal: input.isInternal,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    }),
    addTag: async (input) => ({
      id: "tag-1",
      companyId: input.companyId,
      leadId: input.leadId,
      tag: input.tag,
      createdAt: new Date().toISOString(),
    }),
    removeTag: async () => {},
    listTags: async () => [],
    listNotes: async () => [],
    appendActivity: async (input) => ({
      id: "act-1",
      companyId: input.companyId,
      leadId: input.leadId,
      activityType: input.activityType,
      summary: input.summary,
      payload: input.payload ?? {},
      actorUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    }),
    appendHistory: async (input) => ({
      id: "hist-1",
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
      leadsByStatus: { new: 1 },
      pipelineMetrics: [],
      conversionsInPeriod: 0,
      createdInPeriod: 1,
      forecastValue: 100,
      conversionRate: 0,
    }),
    fetchPipelineMetrics: async () => ({
      pipelineId: "pipe-1",
      pipelineName: "Default",
      stages: [],
    }),
  };
}

describe("LeadCommandService", () => {
  const ctx = {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };

  it("creates a lead", async () => {
    const service = new LeadCommandService({
      leads: createMemoryRepo(),
      assignees: {
        resolveAssigneeLabel: async (id) => id,
        loadAssigneeLabels: async (ids) => new Map(ids.map((id) => [id, id])),
        listAssigneeCandidates: async () => [],
      },
      conversion: { convertLead: async () => ({ customerId: "cust-1" }) },
      events: { publish: async () => {} },
      notifications: { notify: async () => {} },
      audit: { write: async () => {} },
    });

    const result = await service.createLead(ctx, {
      companyId: "company-1",
      title: "Acme Inquiry",
    });
    assert.equal(result.lead.title, "Acme Inquiry");
    assert.equal(result.lead.lifecycleStatus, "new");
  });

  it("qualifies a lead", async () => {
    const repo = createMemoryRepo();
    const service = new LeadCommandService({
      leads: repo,
      assignees: {
        resolveAssigneeLabel: async (id) => id,
        loadAssigneeLabels: async (ids) => new Map(ids.map((id) => [id, id])),
        listAssigneeCandidates: async () => [],
      },
      conversion: { convertLead: async () => ({ customerId: "cust-1" }) },
      events: { publish: async () => {} },
      notifications: { notify: async () => {} },
      audit: { write: async () => {} },
    });

    await service.createLead(ctx, { companyId: "company-1", title: "Lead" });
    const result = await service.qualifyLead(ctx, { companyId: "company-1", leadId: "lead-1", score: 80 });
    assert.equal(result.lead.isQualified, true);
    assert.equal(result.lead.lifecycleStatus, "qualified");
  });

  function buildService(repo = createMemoryRepo()) {
    return {
      repo,
      service: new LeadCommandService({
        leads: repo,
        assignees: {
          resolveAssigneeLabel: async (id) => id,
          loadAssigneeLabels: async (ids) => new Map(ids.map((id) => [id, id])),
          listAssigneeCandidates: async () => [],
        },
        conversion: { convertLead: async () => ({ customerId: "cust-1" }) },
        events: { publish: async () => {} },
        notifications: { notify: async () => {} },
        audit: { write: async () => {} },
      }),
    };
  }

  it("moves a lead forward between stages and persists stage id", async () => {
    const { service, repo } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Forward" });
    const moved = await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-qualified",
    });
    assert.equal(moved.lead.stageId, "stage-qualified");
    assert.equal(moved.lead.lifecycleStatus, "qualified");
    const persisted = await repo.getLead("company-1", "lead-1");
    assert.equal(persisted?.stageId, "stage-qualified");
  });

  it("allows backward stage movement when pipeline allows it", async () => {
    const { service, repo } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Backward" });
    await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-proposal",
    });
    const back = await service.changeLeadStage(ctx, {
      companyId: "company-1",
      leadId: "lead-1",
      stageId: "stage-contacted",
    });
    assert.equal(back.lead.stageId, "stage-contacted");
    assert.equal(back.lead.lifecycleStatus, "contacted");
    const persisted = await repo.getLead("company-1", "lead-1");
    assert.equal(persisted?.stageId, "stage-contacted");
  });

  it("rejects stage movement without leads.edit permission", async () => {
    const { service } = buildService();
    await service.createLead(ctx, { companyId: "company-1", title: "Denied" });
    await assert.rejects(
      () =>
        service.changeLeadStage(
          { ...ctx, hasPermission: () => false },
          { companyId: "company-1", leadId: "lead-1", stageId: "stage-qualified" },
        ),
      /permission|Permission|denied|Forbidden/i,
    );
  });

  it("persists company currency on create when provided", async () => {
    const { service, repo } = buildService();
    const result = await service.createLead(ctx, {
      companyId: "company-1",
      title: "Currency Lead",
      currency: "EGP",
    });
    assert.equal(result.lead.currency, "EGP");
    const persisted = await repo.getLead("company-1", "lead-1");
    assert.equal(persisted?.currency, "EGP");
  });
});
