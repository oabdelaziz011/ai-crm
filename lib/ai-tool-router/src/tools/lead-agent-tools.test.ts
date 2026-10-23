import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LeadRecord } from "@workspace/lead-platform";
import { createLeadAgentTools, nextActionForStatus } from "./lead-agent-tools.js";
import type { LeadAgentToolPorts } from "./lead-agent-ports.js";
import type { ToolExecutionContext } from "./tool-contract.js";

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
    aiSummary: "Existing summary",
    metadata: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function context(): ToolExecutionContext {
  return {
    companyId: "company-a",
    conversationId: "conv-1",
    conversationState: "waiting_user",
    userId: "user-1",
  };
}

describe("lead agent tools", () => {
  it("suggests a next action from the lifecycle and stops closed leads", () => {
    assert.match(nextActionForStatus("qualified"), /demo/i);
    assert.match(nextActionForStatus("lost"), /do not pursue/i);
    assert.match(nextActionForStatus("converted"), /no further sales follow-up/i);
    assert.match(nextActionForStatus("archived"), /do not contact/i);
  });

  it("fails closed when getLead is unavailable instead of merging unsafely", async () => {
    let merged = false;
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("unused");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        merged = true;
        return { lead: lead({}) };
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const denied = await tools.merge_lead!.execute(context(), {
      primaryLeadId: "primary",
      duplicateLeadIds: ["name-only"],
    });
    assert.equal(denied.success, false);
    assert.equal(denied.errorCode, "LEAD_IDENTITY_CHECK_UNAVAILABLE");
    assert.equal(merged, false);
  });

  it("refuses a name-only merge and allows a shared phone", async () => {
    const merged: string[] = [];
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("unused");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads(input) {
        merged.push(input.primaryLeadId);
        return { lead: lead({ id: input.primaryLeadId }) };
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
      async getLead(input) {
        if (input.companyId !== "company-a") return { lead: null };
        if (input.leadId === "primary") return { lead: lead({ id: "primary", phone: "+20 100 000 0001", email: null }) };
        if (input.leadId === "same-phone") return { lead: lead({ id: "same-phone", title: "Other", phone: "01000000001" }) };
        if (input.leadId === "name-only") return { lead: lead({ id: "name-only", title: "Ada", phone: "01000000002", email: "other@example.com" }) };
        return { lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const denied = await tools.merge_lead!.execute(context(), {
      primaryLeadId: "primary",
      duplicateLeadIds: ["name-only"],
    });
    assert.equal(denied.success, false);
    assert.equal(denied.errorCode, "LEAD_IDENTITY_UNVERIFIED");
    assert.deepEqual(merged, []);

    const allowed = await tools.merge_lead!.execute(context(), {
      primaryLeadId: "primary",
      duplicateLeadIds: ["same-phone"],
    });
    assert.equal(allowed.success, true);
    assert.deepEqual(merged, ["primary"]);
  });

  it("records score evidence without inventing budget, timeline, or authority", async () => {
    const summaries: string[] = [];
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead(input) {
        summaries.push(input.aiSummary ?? "");
        return { lead: lead({ score: input.score ?? 0, aiSummary: input.aiSummary ?? "" }) };
      },
      async qualifyLead() {
        throw new Error("unused");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead(input) {
        return { lead: lead({ score: input.score }) };
      },
      async suggestNextAction() {
        return { suggestion: nextActionForStatus("new"), lead: lead({}) };
      },
      async getLead() {
        return { lead: lead({}) };
      },
    };
    const tools = createLeadAgentTools(ports);
    const scored = await tools.score_lead!.execute(context(), {
      leadId: "lead-1",
      score: 70,
      explanation: "Customer asked for a demo date.",
    });
    assert.equal(scored.success, true);
    assert.equal(scored.explanation, "Customer asked for a demo date.");
    assert.deepEqual(scored.unknown, ["budget", "timeline", "purchase_authority"]);
    assert.match(summaries[0] ?? "", /Existing summary/);
    assert.match(summaries[0] ?? "", /Customer asked for a demo date/);
    await assert.rejects(() => tools.score_lead!.execute(context(), { leadId: "lead-1", score: 140 }));
  });

  it("qualify_lead returns authoritative qualification fields on success", async () => {
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead(input) {
        assert.equal(input.qualificationPolicyMode, "enforce");
        assert.equal(input.evidence, undefined);
        assert.deepEqual(input.conversationTexts, []);
        return {
          lead: lead({
            id: input.leadId,
            score: input.score ?? 0,
            isQualified: true,
            lifecycleStatus: "qualified",
            qualifiedAt: "2026-10-19T12:00:00.000Z",
          }),
          qualificationApplied: true,
          policy: { outcome: "qualified" },
        };
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const result = await tools.qualify_lead!.execute(context(), {
      leadId: "lead-1",
      score: 88,
      explicitBuyingIntent: true,
      productInterest: true,
    });
    assert.equal(result.success, true);
    assert.equal(result.qualificationApplied, true);
    assert.equal(result.lead.isQualified, true);
    assert.equal(result.lead.lifecycleStatus, "qualified");
    assert.equal(result.lead.score, 88);
  });

  it("qualify_lead passes server conversation text and drops model buying-intent flags", async () => {
    let seen: { conversationTexts?: readonly string[]; evidence?: { explicitBuyingIntent?: boolean } } | null = null;
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead(input) {
        seen = { conversationTexts: input.conversationTexts, evidence: input.evidence };
        return {
          lead: lead({ id: input.leadId, isQualified: false, lifecycleStatus: "new" }),
          qualificationApplied: false,
          policy: { outcome: "interested_not_qualified" },
        };
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const result = await tools.qualify_lead!.execute(
      { ...context(), trustedConversationTexts: ["What is the price of Aurora Studio?"] },
      { leadId: "lead-1", explicitBuyingIntent: true, productInterest: true },
    );
    assert.equal(result.success, false);
    assert.deepEqual(seen?.conversationTexts, ["What is the price of Aurora Studio?"]);
    assert.equal(seen?.evidence, undefined);
  });

  it("qualify_lead reports success false when qualification was not applied", async () => {
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        return {
          lead: lead({
            id: "lead-1",
            isQualified: false,
            lifecycleStatus: "new",
          }),
          qualificationApplied: false,
          policy: { outcome: "insufficient_evidence" },
        };
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const result = await tools.qualify_lead!.execute(context(), { leadId: "lead-1" });
    assert.equal(result.success, false);
    assert.equal(result.qualificationApplied, false);
    assert.match(String(result.instruction), /Do not tell the customer they are qualified/i);
  });

  it("qualify_lead rejects a customer id instead of pretending the lead was qualified", async () => {
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("Lead not found: 0ed1b580-b0d9-4452-a009-9b4b564fe3f4");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    const result = await tools.qualify_lead!.execute(context(), {
      leadId: "0ed1b580-b0d9-4452-a009-9b4b564fe3f4",
    });
    assert.equal(result.success, false);
    assert.equal(result.qualificationApplied, false);
    assert.equal(result.errorCode, "NOT_A_LEAD");
    assert.deepEqual(result.needs_data, { missing: ["lead"] });
  });

  it("qualify_lead does not report success when the port fails", async () => {
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("Permission denied: leads.qualify");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads() {
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    await assert.rejects(
      () => tools.qualify_lead!.execute(context(), { leadId: "lead-1" }),
      /leads\.qualify/,
    );
  });

  it("uses the server company id for search", async () => {
    let seen = "";
    const ports: LeadAgentToolPorts = {
      async createLead() {
        throw new Error("unused");
      },
      async updateLead() {
        throw new Error("unused");
      },
      async qualifyLead() {
        throw new Error("unused");
      },
      async convertLead() {
        throw new Error("unused");
      },
      async assignLead() {
        throw new Error("unused");
      },
      async searchLeads(input) {
        seen = input.companyId;
        return { leads: [], total: 0 };
      },
      async mergeLeads() {
        throw new Error("unused");
      },
      async scoreLead() {
        throw new Error("unused");
      },
      async suggestNextAction() {
        return { suggestion: "", lead: null };
      },
    };
    const tools = createLeadAgentTools(ports);
    await tools.search_lead!.execute(context(), { query: "Ada", companyId: "company-b" });
    assert.equal(seen, "company-a");
  });
});
