import type { AgentConfirmationRequest } from "../confirmation/confirmation-types.js";
import { isConfirmationInvalidated } from "../confirmation/confirmation-token.js";
import { findPendingConfirmationTask } from "../confirmation/confirmation-gate.js";
import type {
  AgentMemoryState,
  AgentTaskGraph,
  AgentTaskNode,
  AgentWorkflowRecord,
  AgentWorkflowStatus,
} from "../types.js";

export const CHECKPOINT_SNAPSHOT_VERSION = 1;

export type AgentCheckpointSnapshot = {
  version: typeof CHECKPOINT_SNAPSHOT_VERSION;
  workflowId: string;
  checkpointIndex: number;
  status: AgentWorkflowStatus;
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
  completedTaskIds: string[];
  pendingTaskIds: string[];
  currentTaskId: string | null;
  confirmationState: {
    pendingConfirmation: AgentConfirmationRequest | null;
    confirmationInvalidated: boolean;
  };
  executionContext: {
    companyId: string;
    userId: string | null;
    conversationId: string | null;
    goal: string;
    correlationId: string;
  };
  savedAt: string;
};

export type CheckpointValidationResult =
  | { valid: true; snapshot: AgentCheckpointSnapshot }
  | { valid: false; code: string; message: string };

const RECOVERABLE_STATUSES = new Set<AgentWorkflowStatus>([
  "planning",
  "running",
  "paused",
  "waiting_user",
  "failed",
]);

export function isRecoverableWorkflowStatus(status: AgentWorkflowStatus): boolean {
  return RECOVERABLE_STATUSES.has(status);
}

export function listCompletedTaskIds(graph: AgentTaskGraph): string[] {
  return graph.nodes
    .filter((node) => node.status === "verified" || node.status === "completed")
    .map((node) => node.id);
}

export function listPendingTaskIds(graph: AgentTaskGraph): string[] {
  return graph.nodes
    .filter((node) =>
      ["pending", "waiting", "running", "retrying", "planning"].includes(node.status),
    )
    .map((node) => node.id);
}

export function resolveCurrentTaskId(graph: AgentTaskGraph): string | null {
  const waiting = findPendingConfirmationTask(graph);
  if (waiting) return waiting.id;

  const running = graph.nodes.find((node) => node.status === "running");
  if (running) return running.id;

  const retrying = graph.nodes.find((node) => node.status === "retrying");
  if (retrying) return retrying.id;

  const pending = graph.nodes.find((node) => node.status === "pending");
  return pending?.id ?? null;
}

export function buildCheckpointSnapshot(input: {
  workflow: AgentWorkflowRecord;
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
  currentTaskId?: string | null;
}): AgentCheckpointSnapshot {
  const pendingConfirmation = resolvePendingConfirmation(input.taskGraph, input.memory);

  return {
    version: CHECKPOINT_SNAPSHOT_VERSION,
    workflowId: input.workflow.id,
    checkpointIndex: input.workflow.checkpoint_index + 1,
    status: input.workflow.status,
    taskGraph: input.taskGraph,
    memory: input.memory,
    completedTaskIds: listCompletedTaskIds(input.taskGraph),
    pendingTaskIds: listPendingTaskIds(input.taskGraph),
    currentTaskId: input.currentTaskId ?? resolveCurrentTaskId(input.taskGraph),
    confirmationState: {
      pendingConfirmation,
      confirmationInvalidated: isConfirmationInvalidated(input.memory),
    },
    executionContext: {
      companyId: input.workflow.company_id,
      userId: input.workflow.user_id,
      conversationId: input.workflow.conversation_id,
      goal: input.workflow.goal,
      correlationId: input.workflow.correlation_id,
    },
    savedAt: new Date().toISOString(),
  };
}

function resolvePendingConfirmation(
  graph: AgentTaskGraph,
  memory: AgentMemoryState,
): AgentConfirmationRequest | null {
  const waitingTask = findPendingConfirmationTask(graph);
  const fromTask = waitingTask?.result?.confirmationRequest;
  if (fromTask && typeof fromTask === "object") {
    return fromTask as AgentConfirmationRequest;
  }

  const fromMemory = memory.executionState?.pendingConfirmation;
  if (fromMemory && typeof fromMemory === "object") {
    return fromMemory as AgentConfirmationRequest;
  }

  return null;
}

export type MonotonicCheckpointDecision =
  | { action: "apply" }
  | { action: "skip" }
  | { action: "reject"; code: string; message: string };

export function evaluateMonotonicCheckpoint(input: {
  snapshotIndex: number;
  workflowCheckpointIndex: number;
  lastRecoveredCheckpointIndex?: number | null;
}): MonotonicCheckpointDecision {
  const lastRecovered = input.lastRecoveredCheckpointIndex;

  if (input.snapshotIndex < input.workflowCheckpointIndex) {
    return {
      action: "reject",
      code: "CHECKPOINT_STALE",
      message: `Checkpoint index ${input.snapshotIndex} is older than workflow checkpoint index ${input.workflowCheckpointIndex}.`,
    };
  }

  if (lastRecovered != null && input.snapshotIndex < lastRecovered) {
    return {
      action: "reject",
      code: "CHECKPOINT_STALE",
      message: `Checkpoint index ${input.snapshotIndex} is older than last recovered checkpoint index ${lastRecovered}.`,
    };
  }

  if (lastRecovered != null && input.snapshotIndex === lastRecovered) {
    return { action: "skip" };
  }

  return { action: "apply" };
}

export function validateCheckpointSnapshot(
  raw: unknown,
  expectedWorkflowId: string,
): CheckpointValidationResult {
  if (!raw || typeof raw !== "object") {
    return { valid: false, code: "CHECKPOINT_CORRUPT", message: "Checkpoint snapshot is missing." };
  }

  const snapshot = raw as Partial<AgentCheckpointSnapshot>;

  if (snapshot.version !== CHECKPOINT_SNAPSHOT_VERSION) {
    return {
      valid: false,
      code: "CHECKPOINT_UNSUPPORTED",
      message: "Checkpoint snapshot version is unsupported.",
    };
  }

  if (snapshot.workflowId !== expectedWorkflowId) {
    return {
      valid: false,
      code: "CHECKPOINT_WORKFLOW_MISMATCH",
      message: "Checkpoint snapshot does not belong to this workflow.",
    };
  }

  if (!snapshot.taskGraph || !Array.isArray(snapshot.taskGraph.nodes)) {
    return {
      valid: false,
      code: "CHECKPOINT_CORRUPT",
      message: "Checkpoint task graph is invalid.",
    };
  }

  if (!snapshot.memory || typeof snapshot.memory !== "object") {
    return {
      valid: false,
      code: "CHECKPOINT_CORRUPT",
      message: "Checkpoint memory is invalid.",
    };
  }

  if (typeof snapshot.checkpointIndex !== "number" || snapshot.checkpointIndex < 0) {
    return {
      valid: false,
      code: "CHECKPOINT_CORRUPT",
      message: "Checkpoint index is invalid.",
    };
  }

  return { valid: true, snapshot: snapshot as AgentCheckpointSnapshot };
}

export function normalizeInterruptedGraph(graph: AgentTaskGraph): AgentTaskGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => normalizeInterruptedNode(node)),
  };
}

function normalizeInterruptedNode(node: AgentTaskNode): AgentTaskNode {
  if (node.status === "running" || node.status === "retrying") {
    return { ...node, status: "pending" };
  }
  return node;
}

export function applyCheckpointSnapshot(snapshot: AgentCheckpointSnapshot): {
  task_graph: AgentTaskGraph;
  memory: AgentMemoryState;
  status: AgentWorkflowStatus;
  error_message: string | null;
  checkpoint_index: number;
} {
  const normalizedGraph = normalizeInterruptedGraph(snapshot.taskGraph);

  return {
    task_graph: normalizedGraph,
    memory: snapshot.memory,
    status: snapshot.status,
    error_message: snapshot.confirmationState.pendingConfirmation?.summary ?? null,
    checkpoint_index: snapshot.checkpointIndex,
  };
}

export function isTaskAlreadyCompleted(task: AgentTaskNode): boolean {
  return task.status === "verified" || task.status === "completed";
}

export function findRecoverableWorkflow(
  workflows: AgentWorkflowRecord[],
  input?: { conversationId?: string | null; userId?: string | null },
): AgentWorkflowRecord | null {
  const candidates = workflows.filter((workflow) => isRecoverableWorkflowStatus(workflow.status));

  if (input?.conversationId) {
    const byConversation = candidates.find(
      (workflow) => workflow.conversation_id === input.conversationId,
    );
    if (byConversation) return byConversation;
  }

  if (input?.userId) {
    const byUser = candidates.find((workflow) => workflow.user_id === input.userId);
    if (byUser) return byUser;
  }

  return candidates[0] ?? null;
}

/** @deprecated Use AgentCheckpointSnapshot from checkpoint-recovery */
export type CheckpointSnapshot = {
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
  status: AgentWorkflowStatus;
};
