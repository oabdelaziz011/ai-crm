/**
 * Phase 5I — webhook transfer_to_workflow regression (registration remains wired).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listRegisteredToolHandlerKeys, type WorkflowTransferToolPorts } from "@workspace/ai-tool-router";
import { createWebhookToolRouterIntegrations } from "./create-webhook-tool-router-integrations.js";

function createMockSupabaseClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe("Phase 5I — webhook transfer_to_workflow regression", () => {
  it("J — transfer_to_workflow remains registered when workflowTransferPorts provided", () => {
    const workflowTransferPorts: WorkflowTransferToolPorts = {
      async transferToWorkflow() {
        return {
          transferred: true,
          flowId: "flow-1",
          runId: "run-1",
          responseContent: null,
          customerFacingMessage: "ok",
        };
      },
    };

    const { createOptions } = createWebhookToolRouterIntegrations(createMockSupabaseClient() as never, {
      workflowTransferPorts,
    });

    const keys = listRegisteredToolHandlerKeys(createOptions);
    assert.ok(keys.includes("transfer_to_workflow"));
    assert.equal(createOptions.workflowTransferPorts, workflowTransferPorts);
  });
});
