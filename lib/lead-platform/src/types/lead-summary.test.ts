import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toLeadSummary, type LeadRecord } from "../types/lead-types.js";

function baseLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    companyId: "co-1",
    pipelineId: "pipe-1",
    stageId: "stage-1",
    sourceId: null,
    lifecycleStatus: "qualified",
    title: "Deal",
    contactName: "Jane",
    email: "jane@example.com",
    phone: null,
    companyName: "Acme",
    priority: "normal",
    estimatedValue: 1000,
    currency: "EGP",
    score: 10,
    isQualified: true,
    isVip: false,
    language: null,
    territory: null,
    department: null,
    assignedUserId: "user-1",
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

describe("toLeadSummary", () => {
  it("preserves customerId for converted/customer-linked leads", () => {
    const summary = toLeadSummary(baseLead({ customerId: "cust-1" }));
    assert.equal(summary.customerId, "cust-1");
  });

  it("preserves null customerId for unconverted leads", () => {
    const summary = toLeadSummary(baseLead({ customerId: null }));
    assert.equal(summary.customerId, null);
  });
});
