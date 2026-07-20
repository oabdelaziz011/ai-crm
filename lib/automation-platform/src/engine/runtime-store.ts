import type { ExecutionLifecycleStatus } from "../constants.js";
import type {
  AutomationRunRecord,
  ConversationSessionRecord,
  UpdateAutomationRunStateInput,
  UpdateConversationSessionStateInput,
} from "../types.js";

export type PersistRunningStateInput = {
  runId: string;
  sessionId: string;
  currentNodeId: string;
  variables: Record<string, unknown>;
};

export type PersistTerminalStateInput = {
  runId: string;
  sessionId: string;
  lifecycle: ExecutionLifecycleStatus;
  currentNodeId?: string | null;
  variables: Record<string, unknown>;
  errorMessage?: string | null;
};

export interface AutomationRuntimeStore {
  updateRunningState(input: PersistRunningStateInput): Promise<{ run: AutomationRunRecord; session: ConversationSessionRecord }>;
  updateTerminalState(input: PersistTerminalStateInput): Promise<{ run: AutomationRunRecord; session: ConversationSessionRecord }>;
}

function mapLifecycleToRunStatus(lifecycle: ExecutionLifecycleStatus) {
  if (lifecycle === "pending") return "pending" as const;
  if (lifecycle === "running") return "running" as const;
  if (lifecycle === "waiting_input") return "waiting_input" as const;
  if (lifecycle === "completed") return "completed" as const;
  if (lifecycle === "failed") return "failed" as const;
  return "cancelled" as const;
}

function mapLifecycleToSessionStatus(lifecycle: ExecutionLifecycleStatus) {
  if (lifecycle === "pending") return "active" as const;
  if (lifecycle === "running") return "running" as const;
  if (lifecycle === "waiting_input") return "waiting_input" as const;
  if (lifecycle === "completed") return "completed" as const;
  if (lifecycle === "failed") return "active" as const;
  if (lifecycle === "cancelled") return "cancelled" as const;
  return "active" as const;
}

export function createAutomationRuntimeStore(deps: {
  updateRun(input: UpdateAutomationRunStateInput): Promise<AutomationRunRecord>;
  updateSession(input: UpdateConversationSessionStateInput): Promise<ConversationSessionRecord>;
}): AutomationRuntimeStore {
  return {
    async updateRunningState(input) {
      const run = await deps.updateRun({
        runId: input.runId,
        status: "running",
        currentNodeId: input.currentNodeId,
        sessionId: input.sessionId,
        variables: input.variables,
      });
      const session = await deps.updateSession({
        sessionId: input.sessionId,
        status: "running",
        currentNodeId: input.currentNodeId,
        runId: input.runId,
        variables: input.variables,
      });
      return { run, session };
    },
    async updateTerminalState(input) {
      const runStatus = mapLifecycleToRunStatus(input.lifecycle);
      const sessionStatus = mapLifecycleToSessionStatus(input.lifecycle);
      const finishedAt =
        input.lifecycle === "completed" || input.lifecycle === "failed" || input.lifecycle === "cancelled"
          ? new Date().toISOString()
          : null;
      const run = await deps.updateRun({
        runId: input.runId,
        status: runStatus,
        currentNodeId: input.currentNodeId ?? null,
        sessionId: input.sessionId,
        variables: input.variables,
        errorMessage: input.errorMessage ?? null,
        finishedAt,
      });
      const session = await deps.updateSession({
        sessionId: input.sessionId,
        status: sessionStatus,
        currentNodeId: input.currentNodeId ?? null,
        runId: input.runId,
        variables: input.variables,
      });
      return { run, session };
    },
  };
}

export function runLifecycle(run: AutomationRunRecord): ExecutionLifecycleStatus {
  if (run.status === "queued" || run.status === "pending") return "pending";
  if (run.status === "running") return "running";
  if (run.status === "waiting_input") return "waiting_input";
  if (run.status === "completed") return "completed";
  if (run.status === "failed") return "failed";
  return "cancelled";
}
