import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LeadSummary } from "@workspace/lead-platform";
import { mapLeadRecordToReadModel } from "./lead-record-mapper.ts";

const labels = { owner: "Owner", stage: "Qualified", source: null };

describe("mapLeadRecordToReadModel", () => {
  it("preserves customerId from LeadSummary", () => {
    const summary = {
      id: "lead-1",
      title: "Deal",
      contactName: "Jane",
      email: "jane@example.com",
      phone: null,
      companyName: "Acme",
      lifecycleStatus: "qualified",
      priority: "normal",
      score: 10,
      estimatedValue: 1000,
      currency: "EGP",
      assignedUserId: "user-1",
      pipelineId: "pipe-1",
      stageId: "stage-1",
      sourceId: null,
      isQualified: true,
      customerId: "cust-99",
      expectedCloseDate: null,
      temperature: null,
      notes: "",
      tags: [],
      lastActivityAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies LeadSummary;

    const mapped = mapLeadRecordToReadModel(summary, "tenant-1", labels);
    assert.equal(mapped.customerId, "cust-99");
  });

  it("maps null customerId for unconverted LeadSummary rows", () => {
    const summary = {
      id: "lead-2",
      title: "Deal",
      contactName: "Jane",
      email: null,
      phone: null,
      companyName: null,
      lifecycleStatus: "qualified",
      priority: "normal",
      score: 0,
      estimatedValue: null,
      currency: "EGP",
      assignedUserId: null,
      pipelineId: "pipe-1",
      stageId: "stage-1",
      sourceId: null,
      isQualified: true,
      customerId: null,
      expectedCloseDate: null,
      temperature: null,
      notes: "",
      tags: [],
      lastActivityAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } satisfies LeadSummary;

    const mapped = mapLeadRecordToReadModel(summary, "tenant-1", labels);
    assert.equal(mapped.customerId, null);
  });
});
