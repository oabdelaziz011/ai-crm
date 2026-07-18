import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationState } from "@workspace/ai-conversation";
import type { ToolDefinitionRepository, ToolExecutionRepository } from "./tool-repositories.js";
import type {
  CompleteToolExecutionInput,
  CreateToolExecutionInput,
  ListToolExecutionsFilter,
  RetryPolicy,
  ToolDefinitionRecord,
  ToolExecutionRecord,
  UpdateToolDefinitionInput,
} from "../types.js";
const DEFINITIONS_TABLE = "tool_definitions";
const EXECUTIONS_TABLE = "tool_executions";

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function parseSupportedStates(value: unknown): ConversationState[] {
  return parseStringArray(value) as ConversationState[];
}

function parseRetryPolicy(value: unknown): RetryPolicy {
  if (typeof value === "object" && value !== null) {
    const policy = value as Record<string, unknown>;
    return {
      maxAttempts: Math.max(1, Number(policy.maxAttempts ?? 1)),
      backoffMs: Math.max(0, Number(policy.backoffMs ?? 0)),
    };
  }
  return { maxAttempts: 1, backoffMs: 0 };
}

function mapDefinition(row: Record<string, unknown>): ToolDefinitionRecord {
  return {
    id: row.id as string,
    key: row.key as string,
    display_name: row.display_name as string,
    description: row.description as string,
    category: row.category as string,
    version: row.version as string,
    is_enabled: Boolean(row.is_enabled),
    required_permissions: parseStringArray(row.required_permissions),
    supported_states: parseSupportedStates(row.supported_states),
    input_schema: (row.input_schema as Record<string, unknown>) ?? {},
    output_schema: (row.output_schema as Record<string, unknown>) ?? {},
    timeout_ms: Number(row.timeout_ms ?? 30000),
    retry_policy: parseRetryPolicy(row.retry_policy),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExecution(row: Record<string, unknown>): ToolExecutionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_id: row.conversation_id as string,
    tool_definition_id: row.tool_definition_id as string,
    tool_key: row.tool_key as string,
    input: (row.input as Record<string, unknown>) ?? {},
    output: (row.output as Record<string, unknown> | null) ?? null,
    status: row.status as ToolExecutionRecord["status"],
    error_code: (row.error_code as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    started_at: row.started_at as string,
    completed_at: (row.completed_at as string | null) ?? null,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    triggered_by: row.triggered_by as ToolExecutionRecord["triggered_by"],
    created_by: (row.created_by as string | null) ?? null,
  };
}

export function createSupabaseToolDefinitionRepository(
  client: SupabaseClient,
): ToolDefinitionRepository {
  return {
    async listEnabled(): Promise<ToolDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .eq("is_enabled", true)
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async listAll(): Promise<ToolDefinitionRecord[]> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .select("*")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((row) => mapDefinition(row as Record<string, unknown>));
    },

    async findById(id: string): Promise<ToolDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },

    async findByKey(key: string): Promise<ToolDefinitionRecord | null> {
      const { data, error } = await client.from(DEFINITIONS_TABLE).select("*").eq("key", key).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapDefinition(data as Record<string, unknown>);
    },

    async updateEnabled(input: UpdateToolDefinitionInput): Promise<ToolDefinitionRecord> {
      const { data, error } = await client
        .from(DEFINITIONS_TABLE)
        .update({ is_enabled: input.isEnabled })
        .eq("id", input.toolId)
        .select("*")
        .single();

      if (error) throw error;
      return mapDefinition(data as Record<string, unknown>);
    },
  };
}

export function createSupabaseToolExecutionRepository(client: SupabaseClient): ToolExecutionRepository {
  return {
    async create(input: CreateToolExecutionInput): Promise<ToolExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          tool_definition_id: input.toolDefinitionId,
          tool_key: input.toolKey,
          input: input.input,
          status: "pending",
          triggered_by: input.triggeredBy ?? "router",
          created_by: input.createdBy ?? null,
        })
        .select("*")
        .single();

      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async markRunning(executionId: string): Promise<ToolExecutionRecord> {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ status: "running" })
        .eq("id", executionId)
        .select("*")
        .single();

      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async complete(input: CompleteToolExecutionInput): Promise<ToolExecutionRecord> {
      const completedAt = new Date().toISOString();
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          status: input.status,
          output: input.output ?? null,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          completed_at: completedAt,
          duration_ms: input.durationMs,
        })
        .eq("id", input.executionId)
        .select("*")
        .single();

      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },

    async findById(id: string): Promise<ToolExecutionRecord | null> {
      const { data, error } = await client.from(EXECUTIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return mapExecution(data as Record<string, unknown>);
    },

    async list(filter: ListToolExecutionsFilter): Promise<ToolExecutionRecord[]> {
      let query = client
        .from(EXECUTIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("started_at", { ascending: false });

      if (filter.conversationId) {
        query = query.eq("conversation_id", filter.conversationId);
      }
      if (filter.toolKey) {
        query = query.eq("tool_key", filter.toolKey);
      }
      if (filter.status) {
        query = query.eq("status", filter.status);
      }
      if (filter.limit) {
        query = query.limit(filter.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map((row) => mapExecution(row as Record<string, unknown>));
    },
  };
}
