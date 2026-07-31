import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentMemoryState,
  AgentTaskGraph,
  AgentWorkflowEventRecord,
  AgentWorkflowRecord,
  AgentWorkflowStatus,
} from "../types.js";
import type { AgentCheckpointSnapshot } from "./checkpoint-recovery.js";

export type { AgentCheckpointSnapshot } from "./checkpoint-recovery.js";
export {
  buildCheckpointSnapshot,
  validateCheckpointSnapshot,
  applyCheckpointSnapshot,
  evaluateMonotonicCheckpoint,
  isRecoverableWorkflowStatus,
  isTaskAlreadyCompleted,
  findRecoverableWorkflow,
  normalizeInterruptedGraph,
} from "./checkpoint-recovery.js";
export {
  DEFAULT_EXECUTION_LEASE_TTL_MS,
  canAcquireExecutionLease,
  createRuntimeLeaseHolder,
} from "./workflow-execution-lease.js";
export { createInMemoryAgentWorkflowRepository } from "./in-memory-agent-workflow-repository.js";

export type CheckpointSnapshot = {
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
  status: AgentWorkflowStatus;
};

export type AgentWorkflowRepository = {
  createWorkflow(input: Omit<AgentWorkflowRecord, "created_at" | "updated_at" | "completed_at">): Promise<AgentWorkflowRecord>;
  updateWorkflow(id: string, patch: Partial<AgentWorkflowRecord>): Promise<AgentWorkflowRecord>;
  getWorkflow(id: string): Promise<AgentWorkflowRecord | null>;
  listWorkflows(companyId: string, limit?: number): Promise<AgentWorkflowRecord[]>;
  deleteWorkflow(id: string): Promise<void>;
  saveCheckpoint(workflowId: string, companyId: string, checkpointIndex: number, snapshot: Record<string, unknown>): Promise<void>;
  loadLatestCheckpoint(workflowId: string): Promise<Record<string, unknown> | null>;
  tryAcquireExecutionLease(workflowId: string, holder: string, ttlMs: number): Promise<boolean>;
  releaseExecutionLease(workflowId: string, holder: string): Promise<boolean>;
  renewExecutionLease(workflowId: string, holder: string, ttlMs: number): Promise<boolean>;
  appendEvent(event: Omit<AgentWorkflowEventRecord, "id" | "created_at">): Promise<AgentWorkflowEventRecord>;
  listEvents(workflowId: string): Promise<AgentWorkflowEventRecord[]>;
};

export function createSupabaseAgentWorkflowRepository(client: SupabaseClient): AgentWorkflowRepository {
  return {
    async createWorkflow(input) {
      const { data, error } = await client
        .from("agent_workflows")
        .insert({
          id: input.id,
          company_id: input.company_id,
          user_id: input.user_id,
          conversation_id: input.conversation_id,
          goal: input.goal,
          status: input.status,
          task_graph: input.task_graph,
          memory: input.memory,
          correlation_id: input.correlation_id,
          checkpoint_index: input.checkpoint_index,
          error_message: input.error_message,
          final_report: input.final_report,
          execution_lease_holder: input.execution_lease_holder ?? null,
          execution_lease_expires_at: input.execution_lease_expires_at ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as AgentWorkflowRecord;
    },

    async updateWorkflow(id, patch) {
      const { data, error } = await client
        .from("agent_workflows")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as AgentWorkflowRecord;
    },

    async getWorkflow(id) {
      const { data, error } = await client.from("agent_workflows").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as AgentWorkflowRecord | null) ?? null;
    },

    async listWorkflows(companyId, limit = 20) {
      const { data, error } = await client
        .from("agent_workflows")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AgentWorkflowRecord[];
    },

    async deleteWorkflow(id) {
      const { error } = await client.from("agent_workflows").delete().eq("id", id);
      if (error) throw error;
    },

    async saveCheckpoint(workflowId, companyId, checkpointIndex, snapshot) {
      const { error } = await client.from("agent_workflow_checkpoints").insert({
        workflow_id: workflowId,
        company_id: companyId,
        checkpoint_index: checkpointIndex,
        snapshot,
      });
      if (error) throw error;
    },

    async loadLatestCheckpoint(workflowId) {
      const { data, error } = await client
        .from("agent_workflow_checkpoints")
        .select("snapshot")
        .eq("workflow_id", workflowId)
        .order("checkpoint_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.snapshot as Record<string, unknown> | null) ?? null;
    },

    async appendEvent(event) {
      const { data, error } = await client
        .from("agent_workflow_events")
        .insert(event)
        .select("*")
        .single();
      if (error) throw error;
      return data as AgentWorkflowEventRecord;
    },

    async listEvents(workflowId) {
      const { data, error } = await client
        .from("agent_workflow_events")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgentWorkflowEventRecord[];
    },

    async tryAcquireExecutionLease(workflowId, holder, ttlMs) {
      const { data, error } = await client.rpc("try_acquire_agent_workflow_execution_lease", {
        p_workflow_id: workflowId,
        p_holder: holder,
        p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      });
      if (error) throw error;
      return Boolean(data);
    },

    async releaseExecutionLease(workflowId, holder) {
      const { data, error } = await client.rpc("release_agent_workflow_execution_lease", {
        p_workflow_id: workflowId,
        p_holder: holder,
      });
      if (error) throw error;
      return Boolean(data);
    },

    async renewExecutionLease(workflowId, holder, ttlMs) {
      const { data, error } = await client.rpc("renew_agent_workflow_execution_lease", {
        p_workflow_id: workflowId,
        p_holder: holder,
        p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      });
      if (error) throw error;
      return Boolean(data);
    },
  };
}
