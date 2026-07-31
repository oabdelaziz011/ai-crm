import type { SupabaseClient } from "@supabase/supabase-js";

export type OperationsToolExecutionRow = {
  id: string;
  tool_key: string;
  status: string;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
};

export type OperationsRetrievalRow = {
  id: string;
  execution_status: string;
  execution_time_ms: number | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

export type OperationsUsageRow = {
  id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  status: string;
  recorded_at: string;
  latency_ms: number | null;
  metadata: Record<string, unknown>;
  correlation_id: string | null;
};

export type OperationsBackgroundTaskRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown>;
  started_at: string;
  label: string;
};

export class AiEmployeeOperationsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listToolExecutions(companyId: string, limit = 100): Promise<OperationsToolExecutionRow[]> {
    const { data, error } = await this.client
      .from("tool_executions")
      .select("id, tool_key, status, duration_ms, error_message, started_at")
      .eq("company_id", companyId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []) as OperationsToolExecutionRow[];
  }

  async listRetrievalExecutions(companyId: string, limit = 100): Promise<OperationsRetrievalRow[]> {
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

  async listPlatformUsage(companyId: string, limit = 200): Promise<OperationsUsageRow[]> {
    const { data, error } = await this.client
      .from("platform_ai_usage")
      .select(
        "id, input_tokens, output_tokens, total_tokens, estimated_cost_usd, status, recorded_at, latency_ms, metadata, correlation_id",
      )
      .eq("company_id", companyId)
      .order("recorded_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      input_tokens: Number(row.input_tokens ?? 0),
      output_tokens: Number(row.output_tokens ?? 0),
      total_tokens: Number(row.total_tokens ?? 0),
      estimated_cost_usd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
      status: row.status as string,
      recorded_at: row.recorded_at as string,
      latency_ms: row.latency_ms == null ? null : Number(row.latency_ms),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      correlation_id: (row.correlation_id as string | null) ?? null,
    }));
  }

  async listBackgroundTasks(companyId: string, limit = 50): Promise<OperationsBackgroundTaskRow[]> {
    const { data, error } = await this.client
      .from("platform_ai_background_tasks")
      .select("id, status, metadata, started_at, label")
      .eq("company_id", companyId)
      .eq("task_type", "agent_workflow")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      status: row.status as string,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      started_at: row.started_at as string,
      label: row.label as string,
    }));
  }
}
