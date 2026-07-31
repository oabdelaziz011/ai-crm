import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateConfirmationGate } from "./confirmation-gate.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import { createTaskNode } from "../task-graph/task-graph.js";
import type { ServiceContext } from "../types.js";

function createContext(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: () => true,
  };
}

describe("confirmation-gate trusted bypass", () => {
  it("ignores client-supplied confirmed=true without a runtime token", () => {
    const graph = {
      workflowId: "wf-1",
      goal: "Merge",
      nodes: [
        createTaskNode({
          id: "merge-task",
          title: "Merge",
          description: "",
          tool: "merge_customers",
          toolInput: {
            primaryCustomerId: "cust-1",
            duplicateCustomerIds: ["cust-2"],
            confirmed: true,
          },
          status: "pending",
        }),
      ],
      edges: [],
    };
    const memory = createInitialMemory(graph.goal, graph);

    const result = evaluateConfirmationGate({
      ctx: createContext(),
      workflowId: "wf-1",
      companyId: "company-1",
      workflowUserId: "user-1",
      task: graph.nodes[0],
      memory,
    });

    assert.equal(result.action, "pause");
    if (result.action === "pause") {
      assert.ok(result.request.confirmationToken);
    }
  });

  it("rejects confirmation when workflow tokens were invalidated", () => {
    const graph = {
      workflowId: "wf-1",
      goal: "Merge",
      nodes: [
        createTaskNode({
          id: "merge-task",
          title: "Merge",
          description: "",
          tool: "merge_customers",
          toolInput: { confirmationToken: "token-abc" },
          status: "pending",
        }),
      ],
      edges: [],
    };
    const memory = createInitialMemory(graph.goal, graph);
    memory.executionState.confirmationInvalidated = true;
    memory.executionState.confirmationTokens = {
      "token-abc": {
        token: "token-abc",
        workflowId: "wf-1",
        taskId: "merge-task",
        toolKey: "merge_customers",
        userId: "user-1",
        companyId: "company-1",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        consumedAt: null,
      },
    };

    const result = evaluateConfirmationGate({
      ctx: createContext(),
      workflowId: "wf-1",
      companyId: "company-1",
      workflowUserId: "user-1",
      task: graph.nodes[0],
      memory,
    });

    assert.equal(result.action, "reject");
    if (result.action === "reject") {
      assert.equal(result.code, "CONFIRMATION_INVALIDATED");
    }
  });
});
