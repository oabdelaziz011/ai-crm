import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AIExecutionMetricsRepository,
  AIExecutionRepository,
  PromptBuildReader,
  ProviderConnectionReader,
} from "./execution-repositories.js";
import type {
  AIExecutionMetricsRecord,
  AIExecutionRecord,
  CompleteAIExecutionInput,
  CreateAIExecutionInput,
  CreateAIExecutionMetricsInput,
  ExecutionRuntimePolicy,
  ListAIExecutionMetricsFilter,
  ListAIExecutionsFilter,
  PromptBuildSnapshot,
  ProviderConnectionSnapshot,
  TokenUsage,
} from "../types.js";

const EXECUTIONS_TABLE = "ai_executions";
const METRICS_TABLE = "ai_execution_metrics";

function mapTokenUsage(value: unknown): TokenUsage {
  if (typeof value === "object" && value !== null) {
    const usage = value as Record<string, unknown>;
    return {
      prompt_tokens: Number(usage.prompt_tokens ?? 0),
      completion_tokens: Number(usage.completion_tokens ?? 0),
      total_tokens: Number(usage.total_tokens ?? 0),
    };
  }
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

function mapExecution(row: Record<string, unknown>): AIExecutionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_id: (row.conversation_id as string | null) ?? null,
    prompt_build_id: (row.prompt_build_id as string | null) ?? null,
    provider_connection_id: (row.provider_connection_id as string | null) ?? null,
    fallback_connection_id: (row.fallback_connection_id as string | null) ?? null,
    provider_key: row.provider_key as string,
    model: row.model as string,
    status: row.status as AIExecutionRecord["status"],
    runtime_policy: (row.runtime_policy as ExecutionRuntimePolicy) ?? {},
    finish_reason: (row.finish_reason as string | null) ?? null,
    raw_response: (row.raw_response as Record<string, unknown> | null) ?? null,
    normalized_response: (row.normalized_response as Record<string, unknown> | null) ?? null,
    token_usage: mapTokenUsage(row.token_usage),
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    retry_count: Number(row.retry_count ?? 0),
    used_fallback_provider: Boolean(row.used_fallback_provider),
    started_at: row.started_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    created_by: (row.created_by as string | null) ?? null,
  };
}

function mapMetrics(row: Record<string, unknown>): AIExecutionMetricsRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    execution_id: row.execution_id as string,
    provider_key: row.provider_key as string,
    model: row.model as string,
    status: row.status as AIExecutionMetricsRecord["status"],
    latency_ms: Number(row.latency_ms ?? 0),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    retry_count: Number(row.retry_count ?? 0),
    used_fallback_provider: Boolean(row.used_fallback_provider),
    recorded_at: row.recorded_at as string,
  };
}

function sanitizeConfiguration(
  configuration: Record<string, unknown>,
  usesPlatformKey: boolean,
): Record<string, unknown> {
  if (!usesPlatformKey) return { ...configuration };
  const next = { ...configuration };
  delete next.apiKey;
  delete next.api_key;
  delete next.secret;
  delete next.token;
  return next;
}

function mapConnection(row: Record<string, unknown>, providerKey: string): ProviderConnectionSnapshot {
  const usesPlatformKey = row.uses_platform_key !== false;
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    provider_key: providerKey,
    configuration: sanitizeConfiguration(
      (row.configuration as Record<string, unknown>) ?? {},
      usesPlatformKey,
    ),
    is_default: Boolean(row.is_default),
    is_enabled: Boolean(row.is_enabled),
    uses_platform_key: usesPlatformKey,
  };
}

export function createSupabasePromptBuildReader(client: SupabaseClient): PromptBuildReader {
  return {
    async findById(id: string): Promise<PromptBuildSnapshot | null> {
      const { data, error } = await client
        .from("prompt_builds")
        .select("id, company_id, conversation_id, final_prompt, output_contract, metadata")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const metadata = (data.metadata as Record<string, unknown> | null) ?? {};
      const contract = (data.output_contract as PromptBuildSnapshot["output_contract"]) ?? {
        format: "text",
        instructions: "Respond naturally in plain text.",
      };
      return {
        id: data.id as string,
        company_id: data.company_id as string,
        conversation_id: (data.conversation_id as string | null) ?? null,
        final_prompt: data.final_prompt as string,
        output_contract: contract,
        gateway_messages:
          (metadata.gateway_messages as PromptBuildSnapshot["gateway_messages"]) ?? [],
        message_plan:
          (metadata.message_plan as PromptBuildSnapshot["message_plan"]) ?? null,
      };
    },
  };
}

export function createSupabaseProviderConnectionReader(client: SupabaseClient): ProviderConnectionReader {
  const SELECT = "*, ai_provider_definition:ai_provider_definitions(key)";

  return {
    async findById(id: string): Promise<ProviderConnectionSnapshot | null> {
      const { data, error } = await client
        .from("ai_provider_connections")
        .select(SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const embedded = data.ai_provider_definition ?? data.ai_provider_definitions;
      const provider = Array.isArray(embedded) ? embedded[0] : embedded;
      const providerKey = (provider?.key as string | undefined) ?? "unknown";
      return mapConnection(data as Record<string, unknown>, providerKey);
    },

    async findDefault(companyId: string): Promise<ProviderConnectionSnapshot | null> {
      const { data, error } = await client
        .from("ai_provider_connections")
        .select(SELECT)
        .eq("company_id", companyId)
        .eq("is_default", true)
        .eq("is_enabled", true)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const embedded = data.ai_provider_definition ?? data.ai_provider_definitions;
      const provider = Array.isArray(embedded) ? embedded[0] : embedded;
      const providerKey = (provider?.key as string | undefined) ?? "unknown";
      return mapConnection(data as Record<string, unknown>, providerKey);
    },
  };
}

export function createSupabaseAIExecutionRepository(client: SupabaseClient): AIExecutionRepository {
  return {
    async create(input: CreateAIExecutionInput): Promise<AIExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId ?? null,
          prompt_build_id: input.promptBuildId,
          provider_connection_id: input.providerConnectionId,
          fallback_connection_id: input.fallbackConnectionId ?? null,
          provider_key: input.providerKey,
          model: input.model,
          runtime_policy: input.runtimePolicy,
          status: "pending",
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async markRunning(executionId: string): Promise<AIExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ status: "running" })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async updateRetryCount(executionId: string, retryCount: number): Promise<AIExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ retry_count: retryCount })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async complete(input: CompleteAIExecutionInput): Promise<AIExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          status: input.status,
          finish_reason: input.finishReason ?? null,
          raw_response: input.rawResponse ?? null,
          normalized_response: input.normalizedResponse ?? null,
          token_usage: input.tokenUsage,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          retry_count: input.retryCount,
          used_fallback_provider: input.usedFallbackProvider,
          completed_at: new Date().toISOString(),
          duration_ms: input.durationMs,
          fallback_connection_id: input.fallbackConnectionId ?? null,
          ...(input.providerKey ? { provider_key: input.providerKey } : {}),
          ...(input.model ? { model: input.model } : {}),
        })
        .eq("id", input.executionId)
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<AIExecutionRecord | null> {
      const { data, error } = await client.from(EXECUTIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapExecution(data as Record<string, unknown>);
    },

    async list(filter: ListAIExecutionsFilter): Promise<AIExecutionRecord[]> {
      let query = client
        .from(EXECUTIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("started_at", { ascending: false });
      if (filter.conversationId) query = query.eq("conversation_id", filter.conversationId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.providerKey) query = query.eq("provider_key", filter.providerKey);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapExecution(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseAIExecutionMetricsRepository(
  client: SupabaseClient,
): AIExecutionMetricsRepository {
  return {
    async create(input: CreateAIExecutionMetricsInput): Promise<AIExecutionMetricsRecord> {
      const { data, error } = await client
        .from(METRICS_TABLE)
        .insert({
          company_id: input.companyId,
          execution_id: input.executionId,
          provider_key: input.providerKey,
          model: input.model,
          status: input.status,
          latency_ms: input.latencyMs,
          prompt_tokens: input.tokenUsage.prompt_tokens,
          completion_tokens: input.tokenUsage.completion_tokens,
          total_tokens: input.tokenUsage.total_tokens,
          retry_count: input.retryCount,
          used_fallback_provider: input.usedFallbackProvider,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapMetrics(data as Record<string, unknown>);
    },

    async findByExecutionId(executionId: string): Promise<AIExecutionMetricsRecord | null> {
      const { data, error } = await client
        .from(METRICS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapMetrics(data as Record<string, unknown>);
    },

    async list(filter: ListAIExecutionMetricsFilter): Promise<AIExecutionMetricsRecord[]> {
      let query = client
        .from(METRICS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("recorded_at", { ascending: false });
      if (filter.providerKey) query = query.eq("provider_key", filter.providerKey);
      if (filter.limit) query = query.limit(filter.limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapMetrics(row as Record<string, unknown>));
    },
  };
}
