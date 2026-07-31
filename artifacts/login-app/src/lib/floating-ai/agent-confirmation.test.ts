import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMidFlightConfirmation } from "./agent-confirmation.js";

describe("resolveMidFlightConfirmation", () => {
  it("returns confirmation request from waiting task result", () => {
    const request = {
      tool: "merge_customers",
      action: "Merge customer records",
      summary: "Merge duplicates",
      affectedResources: [{ type: "customer", id: "cust-1", label: "Customer cust-1" }],
      riskLevel: "critical" as const,
      irreversible: true,
      confirmationToken: "token-123",
      taskId: "merge-task",
      workflowId: "wf-1",
      expiresAt: "2026-07-31T13:00:00.000Z",
    };

    const result = resolveMidFlightConfirmation({
      taskGraph: {
        workflowId: "wf-1",
        goal: "Merge",
        nodes: [
          {
            id: "merge-task",
            title: "Merge",
            description: "",
            tool: "merge_customers",
            status: "waiting",
            dependencies: [],
            retryCount: 0,
            maxRetries: 2,
            result: {
              confirmationRequired: true,
              confirmationRequest: request,
            },
          },
        ],
        edges: [],
      },
    });

    assert.deepEqual(result, request);
  });
});
