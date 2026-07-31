import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCheckpointSnapshot,
  buildCheckpointSnapshot,
  isTaskAlreadyCompleted,
  normalizeInterruptedGraph,
  validateCheckpointSnapshot,
} from "./checkpoint-recovery.js";
import { createInitialMemory } from "../memory/agent-memory.js";
import { createTaskNode } from "../task-graph/task-graph.js";
import type { AgentWorkflowRecord } from "../types.js";

function createWorkflowRecord(overrides?: Partial<AgentWorkflowRecord>): AgentWorkflowRecord {
  const graph = {
    workflowId: "wf-1",
    goal: "Test goal",
    nodes: [
      createTaskNode({
        id: "task-1",
        title: "Done",
        description: "",
        tool: null,
        status: "verified",
      }),
      createTaskNode({
        id: "task-2",
        title: "Pending",
        description: "",
        tool: "merge_customers",
        status: "pending",
      }),
    ],
    edges: [{ from: "task-1", to: "task-2", condition: "on_success" }],
  };

  return {
    id: "wf-1",
    company_id: "company-1",
    user_id: "user-1",
    conversation_id: "conv-1",
    goal: "Test goal",
    status: "running",
    task_graph: graph,
    memory: createInitialMemory("Test goal", graph),
    correlation_id: "corr-1",
    checkpoint_index: 1,
    execution_lease_holder: null,
    execution_lease_expires_at: null,
    error_message: null,
    final_report: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

describe("checkpoint-recovery", () => {
  it("builds snapshot with completed and pending task ids", () => {
    const workflow = createWorkflowRecord();
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: workflow.task_graph,
      memory: workflow.memory,
      currentTaskId: "task-2",
    });

    assert.equal(snapshot.workflowId, "wf-1");
    assert.deepEqual(snapshot.completedTaskIds, ["task-1"]);
    assert.deepEqual(snapshot.pendingTaskIds, ["task-2"]);
    assert.equal(snapshot.currentTaskId, "task-2");
    assert.equal(snapshot.version, 1);
    assert.ok(snapshot.savedAt);
  });

  it("validates matching workflow checkpoint snapshots", () => {
    const workflow = createWorkflowRecord();
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: workflow.task_graph,
      memory: workflow.memory,
    });

    const result = validateCheckpointSnapshot(snapshot, "wf-1");
    assert.equal(result.valid, true);
  });

  it("rejects corrupted checkpoint snapshots", () => {
    const result = validateCheckpointSnapshot({ version: 1, workflowId: "wf-1" }, "wf-1");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "CHECKPOINT_CORRUPT");
    }
  });

  it("rejects checkpoint workflow mismatch", () => {
    const workflow = createWorkflowRecord();
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: workflow.task_graph,
      memory: workflow.memory,
    });

    const result = validateCheckpointSnapshot(snapshot, "wf-other");
    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.equal(result.code, "CHECKPOINT_WORKFLOW_MISMATCH");
    }
  });

  it("normalizes interrupted running tasks to pending", () => {
    const workflow = createWorkflowRecord({
      task_graph: {
        workflowId: "wf-1",
        goal: "Test",
        nodes: [
          createTaskNode({
            id: "task-1",
            title: "Running",
            description: "",
            tool: null,
            status: "running",
          }),
        ],
        edges: [],
      },
    });

    const normalized = normalizeInterruptedGraph(workflow.task_graph);
    assert.equal(normalized.nodes[0]?.status, "pending");
  });

  it("applies checkpoint snapshot with exact memory match", () => {
    const workflow = createWorkflowRecord();
    const memory = {
      ...workflow.memory,
      executionState: { ...workflow.memory.executionState, marker: "checkpoint" },
    };
    const snapshot = buildCheckpointSnapshot({
      workflow,
      taskGraph: workflow.task_graph,
      memory,
    });

    const applied = applyCheckpointSnapshot(snapshot);
    assert.deepEqual(applied.memory, memory);
    assert.equal(applied.checkpoint_index, snapshot.checkpointIndex);
  });

  it("detects already completed tasks for idempotency", () => {
    const verified = createTaskNode({
      id: "t1",
      title: "Done",
      description: "",
      tool: null,
      status: "verified",
    });
    assert.equal(isTaskAlreadyCompleted(verified), true);
  });
});
