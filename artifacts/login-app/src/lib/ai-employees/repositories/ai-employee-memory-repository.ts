import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryCheckpointRow = {
  id: string;
  workflow_id: string;
  checkpoint_index: number;
  snapshot: Record<string, unknown>;
  created_at: string;
};

export type MemoryRetrievalContextRow = {
  id: string;
  execution_id: string;
  chunk_count: number;
  total_tokens: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type MemoryConversationMessageRow = {
  id: string;
  conversation_id: string;
  messageType: string;
  content: string;
  created_at: string;
};

export class AiEmployeeMemoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listCheckpoints(companyId: string, workflowIds: string[], limit = 50): Promise<MemoryCheckpointRow[]> {
    if (workflowIds.length === 0) return [];

    const { data, error } = await this.client
      .from("agent_workflow_checkpoints")
      .select("id, workflow_id, checkpoint_index, snapshot, created_at")
      .eq("company_id", companyId)
      .in("workflow_id", workflowIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      workflow_id: row.workflow_id as string,
      checkpoint_index: Number(row.checkpoint_index),
      snapshot: (row.snapshot as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
    }));
  }

  async listRetrievalContexts(companyId: string, limit = 50): Promise<MemoryRetrievalContextRow[]> {
    const { data, error } = await this.client
      .from("retrieval_contexts")
      .select("id, execution_id, chunk_count, total_tokens, created_at, metadata")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      execution_id: row.execution_id as string,
      chunk_count: Number(row.chunk_count ?? 0),
      total_tokens: row.total_tokens == null ? null : Number(row.total_tokens),
      created_at: row.created_at as string,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }

  async listMessagesForConversations(
    conversationIds: string[],
    limit = 100,
  ): Promise<MemoryConversationMessageRow[]> {
    if (conversationIds.length === 0) return [];

    const { data, error } = await this.client
      .from("conversation_messages")
      .select("id, conversation_id, message_type, content, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      conversation_id: row.conversation_id as string,
      messageType: row.message_type as string,
      content: typeof row.content === "string" ? row.content : JSON.stringify(row.content),
      created_at: row.created_at as string,
    }));
  }

  async listRetrievalExecutions(companyId: string, limit = 100) {
    const { data, error } = await this.client
      .from("retrieval_executions")
      .select("id, execution_status, execution_time_ms, created_at, metadata")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      execution_status: row.execution_status as string,
      execution_time_ms: row.execution_time_ms == null ? null : Number(row.execution_time_ms),
      created_at: row.created_at as string,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    }));
  }
}
