import type { AgentWorkflowEventRecord, AgentWorkflowRecord } from "../types.js";
import type { AgentWorkflowRepository } from "./checkpoint-service.js";
import {
  buildLeaseAcquirePatch,
  buildLeaseReleasePatch,
  canAcquireExecutionLease,
  emptyExecutionLease,
  normalizeWorkflowLeaseFields,
} from "./workflow-execution-lease.js";

export type InMemoryAgentWorkflowRepositoryOptions = {
  seeds?: AgentWorkflowRecord[];
};

export function createInMemoryAgentWorkflowRepository(
  options: InMemoryAgentWorkflowRepositoryOptions = {},
): {
  repo: AgentWorkflowRepository;
  workflows: Map<string, AgentWorkflowRecord>;
  checkpoints: Map<string, Map<number, Record<string, unknown>>>;
} {
  const workflows = new Map<string, AgentWorkflowRecord>();
  const checkpoints = new Map<string, Map<number, Record<string, unknown>>>();

  for (const seed of options.seeds ?? []) {
    workflows.set(seed.id, normalizeWorkflowLeaseFields(seed));
  }

  const repo: AgentWorkflowRepository = {
    createWorkflow: async (input) => {
      const record = normalizeWorkflowLeaseFields({
        ...input,
        ...emptyExecutionLease(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      });
      workflows.set(record.id, record);
      return record;
    },

    updateWorkflow: async (id, patch) => {
      const existing = workflows.get(id);
      if (!existing) throw new Error(`Workflow not found: ${id}`);
      const updated = normalizeWorkflowLeaseFields({
        ...existing,
        ...patch,
        updated_at: new Date().toISOString(),
      });
      workflows.set(id, updated);
      return updated;
    },

    getWorkflow: async (id) => workflows.get(id) ?? null,

    listWorkflows: async (companyId, limit = 20) =>
      [...workflows.values()]
        .filter((workflow) => workflow.company_id === companyId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit),

    deleteWorkflow: async (id) => {
      workflows.delete(id);
      checkpoints.delete(id);
    },

    saveCheckpoint: async (workflowId, _companyId, checkpointIndex, snapshot) => {
      const bucket = checkpoints.get(workflowId) ?? new Map<number, Record<string, unknown>>();
      bucket.set(checkpointIndex, snapshot);
      checkpoints.set(workflowId, bucket);
    },

    loadLatestCheckpoint: async (workflowId) => {
      const bucket = checkpoints.get(workflowId);
      if (!bucket || bucket.size === 0) return null;
      const latest = [...bucket.entries()].sort((a, b) => b[0] - a[0])[0];
      return latest?.[1] ?? null;
    },

    tryAcquireExecutionLease: async (workflowId, holder, ttlMs) => {
      const workflow = workflows.get(workflowId);
      if (!workflow) return false;
      if (!canAcquireExecutionLease(workflow, holder)) return false;
      workflows.set(workflowId, {
        ...workflow,
        ...buildLeaseAcquirePatch(holder, ttlMs),
        updated_at: new Date().toISOString(),
      });
      return true;
    },

    releaseExecutionLease: async (workflowId, holder) => {
      const workflow = workflows.get(workflowId);
      if (!workflow) return false;
      const patch = buildLeaseReleasePatch(holder, workflow);
      if (!patch) return false;
      workflows.set(workflowId, {
        ...workflow,
        ...patch,
        updated_at: new Date().toISOString(),
      });
      return true;
    },

    renewExecutionLease: async (workflowId, holder, ttlMs) => {
      const workflow = workflows.get(workflowId);
      if (!workflow || workflow.execution_lease_holder !== holder) return false;
      workflows.set(workflowId, {
        ...workflow,
        ...buildLeaseAcquirePatch(holder, ttlMs),
        updated_at: new Date().toISOString(),
      });
      return true;
    },

    appendEvent: async (event) => {
      const record: AgentWorkflowEventRecord = {
        ...event,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      return record;
    },

    listEvents: async () => [],
  };

  return { repo, workflows, checkpoints };
}
