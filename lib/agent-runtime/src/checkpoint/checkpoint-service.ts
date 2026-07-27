import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentMemoryState,
  AgentTaskGraph,
  AgentWorkflowEventRecord,
  AgentWorkflowRecord,
  AgentWorkflowStatus,
} from "../types.js";

export type AgentWorkflowRepository = {
  createWorkflow(input: Omit<AgentWorkflowRecord, "created_at" | "updated_at" | "completed_at">): Promise<AgentWorkflowRecord>;
  updateWorkflow(id: string, patch: Partial<AgentWorkflowRecord>): Promise<AgentWorkflowRecord>;
  getWorkflow(id: string): Promise<AgentWorkflowRecord | null>;
  listWorkflows(companyId: string, limit?: number): Promise<AgentWorkflowRecord[]>;
  saveCheckpoint(workflowId: string, companyId: string, checkpointIndex: number, snapshot: Record<string, unknown>): Promise<void>;
  loadLatestCheckpoint(workflowId: string): Promise<Record<string, unknown> | null>;
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
  };
}

export type CheckpointSnapshot = {
  taskGraph: AgentTaskGraph;
  memory: AgentMemoryState;
  status: AgentWorkflowStatus;
};
