import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentCheckpointRecoveryError } from "../errors.js";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import { buildCheckpointSnapshot } from "../checkpoint/checkpoint-recovery.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import type {
  AgentRuntimePorts,
  AgentTaskGraph,
  AgentWorkflowRecord,
  ServiceContext,
} from "../types.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import { createTaskNode } from "../task-graph/task-graph.js";

function createContext(): ServiceContext {
  return {
    userId: "user-1",
    companyId: "company-1",
    isSuperAdmin: false,
    hasPermission: (code) =>
      code === AGENT_PERMISSIONS.view ||
      code === AGENT_PERMISSIONS.execute ||
      code === "tools.execute",
  };
}

function buildSequentialGraph(): { graph: AgentTaskGraph; workflow: AgentWorkflowRecord } {
  const workflowId = "wf-recover-1";
  const nodes = [
    createTaskNode({
      id: "task-read",
      title: "Lookup",
      description: "",
      tool: "search_customer",
      status: "verified",
      result: { results: [{ id: "cust-1" }] },
    }),
    createTaskNode({
      id: "task-write",
      title: "Merge",
      description: "",
      tool: "merge_customers",
      toolInput: { primaryCustomerId: "cust-1", duplicateCustomerIds: ["cust-2"] },
      status: "pending",
      dependencies: ["task-read"],
    }),
  ];
  const graph: AgentTaskGraph = {
    workflowId,
    goal: "Merge customers",
    agentType: "crm",
    nodes,
    edges: [{ from: "task-read", to: "task-write", condition: "on_success" }],
  };

  const workflow: AgentWorkflowRecord = {
    id: workflowId,
    company_id: "company-1",
    user_id: "user-1",
    conversation_id: "conv-1",
    goal: "Merge customers",
    status: "running",
    task_graph: graph,
    memory: createInitialMemory(graph.goal, graph),
    correlation_id: "corr-1",
    checkpoint_index: 1,
    execution_lease_holder: null,
    execution_lease_expires_at: null,
    error_message: null,
    final_report: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };

  return { graph, workflow };
}

async function seedCheckpoint(
  repo: ReturnType<typeof createInMemoryAgentWorkflowRepository>["repo"],
  workflow: AgentWorkflowRecord,
  snapshot: Record<string, unknown> & { checkpointIndex: number },
) {
  await repo.saveCheckpoint(
    workflow.id,
    workflow.company_id,
    snapshot.checkpointIndex,
    snapshot,
  );
}

describe("AgentExecutionEngine checkpoint recovery", () => {
  it("recovers from latest checkpoint without re-running verified tasks", async () => {
    const { graph, workflow } = buildSequentialGraph();
    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });

    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: graph,
      memory: workflow.memory,
      currentTaskId: "task-write",
    });
    await seedCheckpoint(repo, workflow, snapshot as unknown as Record<string, unknown> & { checkpointIndex: number });

    workflow.task_graph.nodes[1]!.status = "running";
    await repo.updateWorkflow(workflow.id, { task_graph: workflow.task_graph });

    const routedTools: string[] = [];
    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async (_ctx, input) => {
          routedTools.push(input.toolKey);
          if (input.toolKey === "search_customer") {
            throw new Error("Verified task must not execute again.");
          }
          return {
            executionId: "exec-1",
            status: "succeeded",
            output: { success: true, merged: true },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const result = await engine.recover(createContext(), workflow.id);

    assert.equal(routedTools.includes("search_customer"), false);
    assert.ok(result.status === "waiting_user" || result.status === "completed");
  });

  it("restores waiting confirmation state without issuing new tokens", async () => {
    const { graph, workflow } = buildSequentialGraph();
    graph.nodes[1]!.status = "waiting";
    graph.nodes[1]!.result = {
      confirmationRequired: true,
      confirmationRequest: {
        tool: "merge_customers",
        action: "Merge",
        summary: "Merge cust-2 into cust-1",
        affectedResources: [],
        riskLevel: "critical",
        irreversible: true,
        confirmationToken: "token-existing",
        taskId: "task-write",
        workflowId: workflow.id,
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
    };
    workflow.task_graph = graph;
    workflow.status = "waiting_user";
    workflow.memory.executionState.confirmationTokens = {
      "token-existing": {
        token: "token-existing",
        workflowId: workflow.id,
        taskId: "task-write",
        toolKey: "merge_customers",
        userId: "user-1",
        companyId: "company-1",
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        consumedAt: null,
      },
    };
    workflow.memory.executionState.pendingConfirmation = graph.nodes[1]!.result!.confirmationRequest;

    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: graph,
      memory: workflow.memory,
      currentTaskId: "task-write",
    });
    await seedCheckpoint(repo, workflow, snapshot as unknown as Record<string, unknown> & { checkpointIndex: number });

    const engine = new AgentExecutionEngine(repo, { toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) } });
    const result = await engine.recover(createContext(), workflow.id);

    assert.equal(result.status, "waiting_user");
    assert.equal(result.confirmationRequest?.confirmationToken, "token-existing");
    const tokenStore = result.taskGraph.nodes[1]?.result ?? {};
    assert.notEqual(tokenStore.confirmationRequest, undefined);
  });

  it("skips duplicate recovery for the same checkpoint index", async () => {
    const { graph, workflow } = buildSequentialGraph();
    workflow.memory.executionState.lastRecoveredCheckpointIndex = 2;

    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: graph,
      memory: workflow.memory,
    });
    snapshot.checkpointIndex = 2;
    await seedCheckpoint(repo, workflow, snapshot as unknown as Record<string, unknown> & { checkpointIndex: number });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) },
    });

    await engine.recover(createContext(), workflow.id);
    const after = (await repo.getWorkflow(workflow.id))!;
    assert.equal(after.memory.executionState.lastRecoveredCheckpointIndex, 2);
  });

  it("rejects corrupted checkpoint snapshots", async () => {
    const { workflow } = buildSequentialGraph();
    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });
    await repo.saveCheckpoint(workflow.id, workflow.company_id, 1, {
      version: 1,
      workflowId: workflow.id,
    });

    const engine = new AgentExecutionEngine(repo, { toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) } });

    await assert.rejects(
      () => engine.recover(createContext(), workflow.id),
      AgentCheckpointRecoveryError,
    );
  });
});
