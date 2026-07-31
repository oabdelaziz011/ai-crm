import type { AgentConfirmationRequest, AgentTaskGraph, AgentWorkflowRecord } from "@workspace/agent-runtime";

export function resolveMidFlightConfirmation(input: {
  workflow?: AgentWorkflowRecord | null;
  taskGraph?: AgentTaskGraph | null;
}): AgentConfirmationRequest | null {
  const graph = input.taskGraph ?? input.workflow?.task_graph ?? null;
  if (!graph) return null;

  const waitingTask = graph.nodes.find(
    (node) =>
      node.status === "waiting" &&
      Boolean((node.result as Record<string, unknown> | undefined)?.confirmationRequired),
  );

  const fromTask = waitingTask?.result?.confirmationRequest;
  if (fromTask && typeof fromTask === "object") {
    return fromTask as AgentConfirmationRequest;
  }

  const fromMemory = input.workflow?.memory?.executionState?.pendingConfirmation;
  if (fromMemory && typeof fromMemory === "object") {
    return fromMemory as AgentConfirmationRequest;
  }

  return null;
}

export function isConfirmationPausedWorkflow(status: string | undefined): boolean {
  return status === "waiting_user" || status === "paused";
}
