import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unwrapCommandResult } from "@/lib/application-layer/application-layer-result.ts";

describe("convertLead opportunityId propagation", () => {
  it("unwrapCommandResult returns opportunityId from ConvertLeadResponseDto", () => {
    const response = unwrapCommandResult({
      data: {
        leadId: "lead-1",
        customerId: "cust-1",
        convertedAt: "2026-08-08T00:00:00.000Z",
        opportunityId: "opp-1",
      },
      correlationId: "corr-1",
      eventIds: [],
    });

    assert.equal(response.opportunityId, "opp-1");
    assert.equal(response.customerId, "cust-1");
  });

  it("unwrapCommandResult tolerates missing opportunityId", () => {
    const response = unwrapCommandResult({
      data: {
        leadId: "lead-1",
        customerId: "cust-1",
        convertedAt: "2026-08-08T00:00:00.000Z",
      },
      correlationId: "corr-2",
      eventIds: [],
    });

    assert.equal(response.opportunityId, undefined);
  });
});
