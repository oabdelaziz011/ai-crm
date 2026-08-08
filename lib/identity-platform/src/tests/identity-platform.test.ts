import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdentityResolutionService } from "../services/identity-resolution-service.js";
import type { IdentityPlatformPorts } from "../ports/identity-platform-ports.js";

function createPorts(overrides: Partial<IdentityPlatformPorts> = {}): IdentityPlatformPorts {
  return {
    customers: {
      async findCustomer() {
        return { status: "not_found", count: 0 };
      },
      async createCustomer() {
        throw new Error("not implemented");
      },
      async updateCustomer() {
        throw new Error("not implemented");
      },
    },
    leadReads: {
      getLead: async () => ({ lead: null }),
      getLeadByConversation: async () => ({ lead: null }),
      getLeadByCustomer: async () => ({ lead: null }),
      searchLeads: async () => ({ leads: [], total: 0 }),
      listPipeline: async () => {
        throw new Error("not implemented");
      },
      listStages: async () => {
        throw new Error("not implemented");
      },
      listPipelines: async () => ({ pipelines: [] }),
      listSources: async () => ({ sources: [] }),
      listLeadActivities: async () => ({ activities: [] }),
      listLeadHistory: async () => ({ history: [] }),
      listLeadNotes: async () => ({ notes: [] }),
      listLeadTags: async () => ({ tags: [] }),
      listAssignedLeads: async () => ({ leads: [] }),
      listCompanyLeads: async () => ({ leads: [], total: 0 }),
      fetchPipelineMetrics: async () => {
        throw new Error("not implemented");
      },
      fetchForecastMetrics: async () => ({ forecastValue: 0, conversionRate: 0 }),
      fetchDashboardMetrics: async () => {
        throw new Error("not implemented");
      },
    },
    leadCommands: {
      createLead: async (_ctx, input) => ({
        lead: {
          id: "lead-1",
          companyId: input.companyId,
          pipelineId: "pipe-1",
          stageId: "stage-1",
          sourceId: null,
          lifecycleStatus: "new",
          title: input.title,
          contactName: input.contactName ?? "",
          email: input.email ?? null,
          phone: input.phone ?? null,
          companyName: null,
          priority: "normal",
          estimatedValue: null,
          currency: "USD",
          score: 0,
          isQualified: false,
          isVip: false,
          language: null,
          territory: null,
          department: null,
          assignedUserId: null,
          customerId: null,
          conversationId: input.conversationId ?? null,
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
        },
      }),
    } as IdentityPlatformPorts["leadCommands"],
    ...overrides,
  };
}

describe("IdentityResolutionService", () => {
  it("creates a lead for unknown visitors", async () => {
    const service = new IdentityResolutionService(createPorts());
    const result = await service.createLeadForUnknown({
      companyId: "company-1",
      actorUserId: "user-1",
      conversationId: "conv-1",
      title: "Website visitor",
    });
    assert.equal(result.kind, "lead");
    assert.equal(result.leadId, "lead-1");
  });
});
