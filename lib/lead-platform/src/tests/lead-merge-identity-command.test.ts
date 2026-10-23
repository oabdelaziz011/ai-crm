import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LeadCommandService } from "../services/lead-command-service.js";
import type { LeadRecord } from "../types/lead-types.js";
import type { LeadRepository } from "../repositories/lead-repository-port.js";
import { LEAD_PERMISSIONS } from "../constants.js";
import {
  createNoopLeadAssigneeResolverPort,
  createNoopLeadAuditPort,
  createNoopLeadConversionPort,
  createNoopLeadEventPublisher,
  createNoopLeadNotificationPort,
} from "../ports/noop-ports.js";

function lead(overrides: Partial<LeadRecord>): LeadRecord {
  return {
    id: "lead-1",
    companyId: "company-a",
    pipelineId: "pipe",
    stageId: "stage",
    sourceId: null,
    lifecycleStatus: "new",
    title: "Ada",
    contactName: "Ada",
    email: null,
    phone: null,
    companyName: null,
    priority: "normal",
    estimatedValue: null,
    currency: "EGP",
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
    lastActivityAt: null,
    aiSummary: "",
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("LeadCommandService.mergeLead identity", () => {
  it("blocks merge before any soft-delete when identity is missing", async () => {
    const deleted: string[] = [];
    const leads = new Map<string, LeadRecord>([
      ["primary", lead({ id: "primary", phone: "01000000001", email: "a@example.com" })],
      ["other", lead({ id: "other", title: "Ada", phone: "01000000002", email: "b@example.com" })],
    ]);
    const repo = {
      getLead: async (companyId: string, leadId: string) => {
        const row = leads.get(leadId);
        return row && row.companyId === companyId ? row : null;
      },
      mergeLeads: async (input: { duplicateLeadIds: string[] }) => {
        deleted.push(...input.duplicateLeadIds);
        return leads.get(input.duplicateLeadIds[0] ? "primary" : "primary")!;
      },
    } as unknown as LeadRepository;

    const service = new LeadCommandService({
      leads: repo,
      assignees: createNoopLeadAssigneeResolverPort(),
      conversion: createNoopLeadConversionPort(),
      events: createNoopLeadEventPublisher(),
      notifications: createNoopLeadNotificationPort(),
      audit: createNoopLeadAuditPort(),
      assignmentGovernance: null,
      assignmentAudit: null,
      opportunityConversion: null,
    });

    const ctx = {
      userId: "user-1",
      companyId: "company-a",
      isSuperAdmin: false,
      hasPermission: (code: string) => code === LEAD_PERMISSIONS.merge || code === LEAD_PERMISSIONS.view,
    };

    await assert.rejects(
      () =>
        service.mergeLead(ctx, {
          companyId: "company-a",
          primaryLeadId: "primary",
          duplicateLeadIds: ["other"],
        }),
      /verified phone or email/i,
    );
    assert.deepEqual(deleted, []);
  });

  it("merges only after shared phone is verified inside the same company", async () => {
    const deleted: string[] = [];
    const leads = new Map<string, LeadRecord>([
      ["primary", lead({ id: "primary", phone: "+20 100 000 0001" })],
      ["dup", lead({ id: "dup", title: "Other", phone: "01000000001" })],
    ]);
    const repo = {
      getLead: async (companyId: string, leadId: string) => {
        const row = leads.get(leadId);
        return row && row.companyId === companyId ? row : null;
      },
      mergeLeads: async (input: { primaryLeadId: string; duplicateLeadIds: string[] }) => {
        deleted.push(...input.duplicateLeadIds);
        return leads.get(input.primaryLeadId)!;
      },
      appendActivity: async () => ({}),
    } as unknown as LeadRepository;

    const service = new LeadCommandService({
      leads: repo,
      assignees: createNoopLeadAssigneeResolverPort(),
      conversion: createNoopLeadConversionPort(),
      events: createNoopLeadEventPublisher(),
      notifications: createNoopLeadNotificationPort(),
      audit: createNoopLeadAuditPort(),
      assignmentGovernance: null,
      assignmentAudit: null,
      opportunityConversion: null,
    });

    const result = await service.mergeLead(
      {
        userId: "user-1",
        companyId: "company-a",
        isSuperAdmin: false,
        hasPermission: () => true,
      },
      { companyId: "company-a", primaryLeadId: "primary", duplicateLeadIds: ["dup"] },
    );
    assert.equal(result.lead.id, "primary");
    assert.deepEqual(deleted, ["dup"]);
  });
});
