import { createRuntimeId } from "../utils/runtime-crypto.js";
import type { AIExecutionStatus } from "../constants.js";
import type { TokenUsage } from "../types.js";

export type ExecutionSessionRecord = {
  sessionId: string;
  executionId: string;
  workflowId: string | null;
  conversationId: string | null;
  promptVersionId: string | null;
  providerKey: string;
  model: string;
  latencyMs: number;
  tokenUsage: TokenUsage;
  estimatedCostUsd: number | null;
  status: AIExecutionStatus;
  createdAt: string;
};

export class ExecutionSessionService {
  private readonly sessions = new Map<string, ExecutionSessionRecord>();

  create(input: Omit<ExecutionSessionRecord, "sessionId" | "createdAt">): ExecutionSessionRecord {
    const session: ExecutionSessionRecord = {
      ...input,
      sessionId: createRuntimeId(),
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(session.executionId, session);
    return session;
  }

  getByExecutionId(executionId: string): ExecutionSessionRecord | undefined {
    return this.sessions.get(executionId);
  }

  list(): ExecutionSessionRecord[] {
    return [...this.sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
