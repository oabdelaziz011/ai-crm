import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AGENT_PERMISSIONS } from "../constants.js";
import { AgentCheckpointRecoveryError } from "../errors.js";
import { buildCheckpointSnapshot, evaluateMonotonicCheckpoint } from "../checkpoint/checkpoint-recovery.js";
import { createInMemoryAgentWorkflowRepository } from "../checkpoint/in-memory-agent-workflow-repository.js";
import {
  DEFAULT_EXECUTION_LEASE_TTL_MS,
  canAcquireExecutionLease,
  isExecutionLeaseExpired,
} from "../checkpoint/workflow-execution-lease.js";
import { AgentExecutionEngine } from "./agent-execution-engine.js";
import type { AgentRuntimePorts, AgentTaskGraph, AgentWorkflowRecord, ServiceContext } from "../types.js";
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
  const workflowId = "wf-hardening-1";
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
      title: "Lookup again",
      description: "",
      tool: "search_customer",
      toolInput: { query: "cust-2" },
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

describe("evaluateMonotonicCheckpoint", () => {
  it("rejects checkpoints older than workflow checkpoint index", () => {
    const decision = evaluateMonotonicCheckpoint({
      snapshotIndex: 3,
      workflowCheckpointIndex: 5,
      lastRecoveredCheckpointIndex: null,
    });
    assert.equal(decision.action, "reject");
    if (decision.action === "reject") {
      assert.equal(decision.code, "CHECKPOINT_STALE");
    }
  });

  it("rejects checkpoints older than last recovered index", () => {
    const decision = evaluateMonotonicCheckpoint({
      snapshotIndex: 4,
      workflowCheckpointIndex: 4,
      lastRecoveredCheckpointIndex: 6,
    });
    assert.equal(decision.action, "reject");
  });

  it("skips already recovered checkpoint index", () => {
    const decision = evaluateMonotonicCheckpoint({
      snapshotIndex: 5,
      workflowCheckpointIndex: 5,
      lastRecoveredCheckpointIndex: 5,
    });
    assert.equal(decision.action, "skip");
  });

  it("allows forward checkpoint apply", () => {
    const decision = evaluateMonotonicCheckpoint({
      snapshotIndex: 7,
      workflowCheckpointIndex: 5,
      lastRecoveredCheckpointIndex: 5,
    });
    assert.equal(decision.action, "apply");
  });
});

describe("workflow execution lease", () => {
  it("acquires and releases a lease exclusively", async () => {
    const { repo, workflows } = createInMemoryAgentWorkflowRepository({
      seeds: [buildSequentialGraph().workflow],
    });
    const workflowId = buildSequentialGraph().workflow.id;

    const first = await repo.tryAcquireExecutionLease(workflowId, "holder-a", 60_000);
    const second = await repo.tryAcquireExecutionLease(workflowId, "holder-b", 60_000);
    assert.equal(first, true);
    assert.equal(second, false);

    const released = await repo.releaseExecutionLease(workflowId, "holder-a");
    const third = await repo.tryAcquireExecutionLease(workflowId, "holder-b", 60_000);
    assert.equal(released, true);
    assert.equal(third, true);
    assert.equal(workflows.get(workflowId)?.execution_lease_holder, "holder-b");
  });

  it("allows acquisition after lease timeout", async () => {
    const { workflow } = buildSequentialGraph();
    workflow.execution_lease_holder = "stale-holder";
    workflow.execution_lease_expires_at = new Date(Date.now() - 1_000).toISOString();

    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });
    assert.equal(canAcquireExecutionLease(workflow, "new-holder"), true);
    assert.equal(isExecutionLeaseExpired(workflow), true);

    const acquired = await repo.tryAcquireExecutionLease(workflow.id, "new-holder", DEFAULT_EXECUTION_LEASE_TTL_MS);
    assert.equal(acquired, true);
  });

  it("renews an active lease for the same holder", async () => {
    const { repo, workflows } = createInMemoryAgentWorkflowRepository({
      seeds: [buildSequentialGraph().workflow],
    });
    const workflowId = buildSequentialGraph().workflow.id;

    await repo.tryAcquireExecutionLease(workflowId, "holder-a", 1_000);
    const before = workflows.get(workflowId)?.execution_lease_expires_at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const renewed = await repo.renewExecutionLease(workflowId, "holder-a", 120_000);
    const after = workflows.get(workflowId)?.execution_lease_expires_at;
    assert.equal(renewed, true);
    assert.notEqual(before, after);
  });
});

describe("AgentExecutionEngine recovery hardening", () => {
  it("prevents duplicate task execution when two recover calls run concurrently", async () => {
    const { graph, workflow } = buildSequentialGraph();
    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });

    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: graph,
      memory: workflow.memory,
      currentTaskId: "task-write",
    });
    await seedCheckpoint(repo, workflow, snapshot as unknown as Record<string, unknown> & { checkpointIndex: number });

    let mergeCalls = 0;
    let releaseGate: (() => void) | null = null;
    const mergeStarted = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const ports: AgentRuntimePorts = {
      toolRouter: {
        route: async (_ctx, input) => {
          if (input.toolKey === "search_customer" && input.input.taskId === "task-write") {
            mergeCalls += 1;
            await mergeStarted;
            return {
              executionId: "exec-search",
              status: "succeeded",
              output: { results: [{ id: "cust-2" }] },
            };
          }
          return {
            executionId: "exec-read",
            status: "succeeded",
            output: { results: [] },
          };
        },
      },
    };

    const engine = new AgentExecutionEngine(repo, ports);
    const ctx = createContext();

    const first = engine.recover(ctx, workflow.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = engine.recover(ctx, workflow.id);

    releaseGate?.();
    await Promise.all([first, second]);

    assert.equal(mergeCalls, 1);
  });

  it("rejects stale checkpoint snapshots during recovery", async () => {
    const { graph, workflow } = buildSequentialGraph();
    workflow.checkpoint_index = 8;
    workflow.memory.executionState.lastRecoveredCheckpointIndex = 8;

    const { repo } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });

    const staleSnapshot = buildCheckpointSnapshot({
      workflow: { ...workflow, checkpoint_index: 7 },
      taskGraph: graph,
      memory: workflow.memory,
    });
    staleSnapshot.checkpointIndex = 5;
    await seedCheckpoint(repo, workflow, staleSnapshot as unknown as Record<string, unknown> & { checkpointIndex: number });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: { route: async () => ({ executionId: "x", status: "succeeded", output: {} }) },
    });

    await assert.rejects(
      () => engine.recover(createContext(), workflow.id),
      (error: unknown) =>
        error instanceof AgentCheckpointRecoveryError && error.recoveryCode === "CHECKPOINT_STALE",
    );
  });

  it("releases execution lease after recover completes", async () => {
    const { workflow } = buildSequentialGraph();
    const { repo, workflows } = createInMemoryAgentWorkflowRepository({ seeds: [workflow] });

    const engine = new AgentExecutionEngine(repo, {
      toolRouter: {
        route: async () => ({
          executionId: "exec-1",
          status: "succeeded",
          output: { results: [{ id: "cust-2" }] },
        }),
      },
    });

    await engine.recover(createContext(), workflow.id);
    assert.equal(workflows.get(workflow.id)?.execution_lease_holder, null);
    assert.equal(workflows.get(workflow.id)?.execution_lease_expires_at, null);
  });
});
