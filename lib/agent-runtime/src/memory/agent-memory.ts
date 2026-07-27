import type { AgentMemoryState, AgentTaskGraph } from "../types.js";

export function createInitialMemory(goal: string, graph: AgentTaskGraph): AgentMemoryState {
  return {
    goal,
    variables: {},
    completedTaskIds: [],
    pendingTaskIds: graph.nodes.map((n) => n.id),
    toolOutputs: {},
    executionState: { startedAt: new Date().toISOString() },
  };
}

export function recordTaskOutput(
  memory: AgentMemoryState,
  taskId: string,
  output: Record<string, unknown> | null,
): AgentMemoryState {
  return {
    ...memory,
    toolOutputs: { ...memory.toolOutputs, [taskId]: output },
    completedTaskIds: memory.completedTaskIds.includes(taskId)
      ? memory.completedTaskIds
      : [...memory.completedTaskIds, taskId],
    pendingTaskIds: memory.pendingTaskIds.filter((id) => id !== taskId),
  };
}

export function setVariable(memory: AgentMemoryState, key: string, value: unknown): AgentMemoryState {
  return {
    ...memory,
    variables: { ...memory.variables, [key]: value },
  };
}

export function mergeExecutionState(
  memory: AgentMemoryState,
  patch: Record<string, unknown>,
): AgentMemoryState {
  return {
    ...memory,
    executionState: { ...memory.executionState, ...patch },
  };
}
