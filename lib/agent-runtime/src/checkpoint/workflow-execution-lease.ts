import type { AgentWorkflowRecord } from "../types.js";

/** Default TTL for workflow execution leases (2 minutes). */
export const DEFAULT_EXECUTION_LEASE_TTL_MS = 120_000;

export type WorkflowExecutionLeaseFields = {
  execution_lease_holder: string | null;
  execution_lease_expires_at: string | null;
};

export function emptyExecutionLease(): WorkflowExecutionLeaseFields {
  return {
    execution_lease_holder: null,
    execution_lease_expires_at: null,
  };
}

export function canAcquireExecutionLease(
  workflow: WorkflowExecutionLeaseFields,
  holder: string,
  nowMs: number = Date.now(),
): boolean {
  if (!workflow.execution_lease_holder) return true;
  if (workflow.execution_lease_holder === holder) return true;

  if (!workflow.execution_lease_expires_at) return false;

  return new Date(workflow.execution_lease_expires_at).getTime() <= nowMs;
}

export function buildLeaseAcquirePatch(
  holder: string,
  ttlMs: number,
  nowMs: number = Date.now(),
): WorkflowExecutionLeaseFields {
  return {
    execution_lease_holder: holder,
    execution_lease_expires_at: new Date(nowMs + ttlMs).toISOString(),
  };
}

export function buildLeaseReleasePatch(
  holder: string,
  workflow: WorkflowExecutionLeaseFields,
): WorkflowExecutionLeaseFields | null {
  if (workflow.execution_lease_holder !== holder) return null;
  return emptyExecutionLease();
}

export function isExecutionLeaseExpired(
  workflow: WorkflowExecutionLeaseFields,
  nowMs: number = Date.now(),
): boolean {
  if (!workflow.execution_lease_holder || !workflow.execution_lease_expires_at) return false;
  return new Date(workflow.execution_lease_expires_at).getTime() <= nowMs;
}

export function normalizeWorkflowLeaseFields(
  workflow: AgentWorkflowRecord,
): AgentWorkflowRecord {
  return {
    ...workflow,
    execution_lease_holder: workflow.execution_lease_holder ?? null,
    execution_lease_expires_at: workflow.execution_lease_expires_at ?? null,
  };
}

export function createRuntimeLeaseHolder(runtimeInstanceId: string): string {
  return `${runtimeInstanceId}:${crypto.randomUUID()}`;
}
