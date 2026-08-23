import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RuntimeExecutionNotFoundError,
  RuntimePolicyNotFoundError,
} from "../errors/error-catalog.js";
import type {
  RuntimeErrorRepository,
  RuntimeExecutionRepository,
  RuntimePolicyRepository,
  RuntimeSessionRepository,
  RuntimeStepRepository,
} from "./runtime-repositories.js";
import type {
  CreateExecutionPolicyInput,
  CreateRuntimeErrorInput,
  CreateRuntimeExecutionInput,
  CreateRuntimeSessionInput,
  CreateRuntimeStepInput,
  ExecutionPolicyRecord,
  RuntimeErrorRecord,
  RuntimeExecutionRecord,
  RuntimeSessionRecord,
  RuntimeStepRecord,
  UpdateExecutionPolicyInput,
} from "../types.js";

const POLICIES_TABLE = "execution_policies";
const SESSIONS_TABLE = "runtime_sessions";
const EXECUTIONS_TABLE = "runtime_executions";
const STEPS_TABLE = "runtime_execution_steps";
const ERRORS_TABLE = "runtime_execution_errors";

function mapPolicy(row: Record<string, unknown>): ExecutionPolicyRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    policy_name: row.policy_name as string,
    knowledge_retrieval_enabled: Boolean(row.knowledge_retrieval_enabled),
    max_pipeline_duration_ms: Number(row.max_pipeline_duration_ms),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    is_default: Boolean(row.is_default),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapSession(row: Record<string, unknown>): RuntimeSessionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    conversation_id: row.conversation_id as string,
    session_status: row.session_status as RuntimeSessionRecord["session_status"],
    correlation_id: (row.correlation_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapExecution(row: Record<string, unknown>): RuntimeExecutionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    session_id: row.session_id as string,
    conversation_id: row.conversation_id as string,
    policy_id: (row.policy_id as string | null) ?? null,
    execution_status: row.execution_status as RuntimeExecutionRecord["execution_status"],
    intent_key: (row.intent_key as string | null) ?? null,
    provider_key: (row.provider_key as string | null) ?? null,
    prompt_build_id: (row.prompt_build_id as string | null) ?? null,
    ai_execution_id: (row.ai_execution_id as string | null) ?? null,
    retrieval_execution_id: (row.retrieval_execution_id as string | null) ?? null,
    vector_query_execution_id: (row.vector_query_execution_id as string | null) ?? null,
    execution_time_ms: row.execution_time_ms == null ? null : Number(row.execution_time_ms),
    correlation_id: (row.correlation_id as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapStep(row: Record<string, unknown>): RuntimeStepRecord {
  return {
    id: row.id as string,
    execution_id: row.execution_id as string,
    stage: row.stage as RuntimeStepRecord["stage"],
    step_status: row.step_status as RuntimeStepRecord["step_status"],
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapError(row: Record<string, unknown>): RuntimeErrorRecord {
  return {
    id: row.id as string,
    execution_id: row.execution_id as string,
    step_id: (row.step_id as string | null) ?? null,
    error_code: row.error_code as string,
    error_category: row.error_category as string,
    human_message: row.human_message as string,
    developer_message: row.developer_message as string,
    correlation_id: (row.correlation_id as string | null) ?? null,
    recoverable: Boolean(row.recoverable),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

function isArchived(record: ExecutionPolicyRecord): boolean {
  return record.metadata.archived === true;
}

export function createSupabaseRuntimePolicyRepository(client: SupabaseClient): RuntimePolicyRepository {
  return {
    async findByCompany(companyId) {
      const { data, error } = await client.from(POLICIES_TABLE).select("*").eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []).map((row) => mapPolicy(row as Record<string, unknown>)).filter((item) => !isArchived(item));
    },
    async create(input) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .insert({
          company_id: input.companyId,
          policy_name: input.policyName,
          knowledge_retrieval_enabled: input.knowledgeRetrievalEnabled ?? true,
          max_pipeline_duration_ms: input.maxPipelineDurationMs ?? 120000,
          metadata: input.metadata ?? {},
          is_default: input.isDefault ?? false,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapPolicy(data as Record<string, unknown>);
    },
    async update(input) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .update({
          policy_name: input.policyName,
          knowledge_retrieval_enabled: input.knowledgeRetrievalEnabled,
          max_pipeline_duration_ms: input.maxPipelineDurationMs,
          metadata: input.metadata,
          is_default: input.isDefault,
        })
        .eq("id", input.policyId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RuntimePolicyNotFoundError(input.policyId);
      return mapPolicy(data as Record<string, unknown>);
    },
    async archive(policyId) {
      const existing = await this.findById(policyId);
      if (!existing) throw new RuntimePolicyNotFoundError(policyId);
      return this.update({ policyId, metadata: { ...existing.metadata, archived: true } });
    },
    async findById(id) {
      const { data, error } = await client.from(POLICIES_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapPolicy(data as Record<string, unknown>) : null;
    },
    async findDefault(companyId) {
      const { data, error } = await client
        .from(POLICIES_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPolicy(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseRuntimeSessionRepository(client: SupabaseClient): RuntimeSessionRepository {
  return {
    async createSession(input) {
      const { data, error } = await client
        .from(SESSIONS_TABLE)
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          session_status: "active",
          correlation_id: input.correlationId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSession(data as Record<string, unknown>);
    },
    async updateStatus(sessionId, status) {
      const { data, error } = await client
        .from(SESSIONS_TABLE)
        .update({ session_status: status })
        .eq("id", sessionId)
        .select("*")
        .single();
      if (error) throw error;
      return mapSession(data as Record<string, unknown>);
    },
    async findSession(id) {
      const { data, error } = await client.from(SESSIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapSession(data as Record<string, unknown>) : null;
    },
    async findByConversation(conversationId) {
      const { data, error } = await client
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("conversation_id", conversationId)
        .eq("session_status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSession(data as Record<string, unknown>) : null;
    },
  };
}

export function createSupabaseRuntimeExecutionRepository(client: SupabaseClient): RuntimeExecutionRepository {
  return {
    async createExecution(input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .insert({
          company_id: input.companyId,
          session_id: input.sessionId,
          conversation_id: input.conversationId,
          policy_id: input.policyId ?? null,
          execution_status: "running",
          correlation_id: input.correlationId ?? null,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapExecution(data as Record<string, unknown>);
    },
    async updateStatus(executionId, status) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({ execution_status: status })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RuntimeExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async completeExecution(executionId, input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          execution_status: "completed",
          execution_time_ms: input.executionTimeMs,
          intent_key: input.intentKey,
          provider_key: input.providerKey,
          prompt_build_id: input.promptBuildId,
          ai_execution_id: input.aiExecutionId,
          retrieval_execution_id: input.retrievalExecutionId,
          vector_query_execution_id: input.vectorQueryExecutionId,
          metadata: input.metadata,
        })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RuntimeExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async failExecution(executionId, input) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .update({
          execution_status: "failed",
          execution_time_ms: input.executionTimeMs,
          error_message: input.errorMessage,
        })
        .eq("id", executionId)
        .select("*")
        .single();
      if (error) throw error;
      if (!data) throw new RuntimeExecutionNotFoundError(executionId);
      return mapExecution(data as Record<string, unknown>);
    },
    async findExecution(id) {
      const { data, error } = await client.from(EXECUTIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapExecution(data as Record<string, unknown>) : null;
    },
    async findByCompany(companyId) {
      const { data, error } = await client
        .from(EXECUTIONS_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapExecution(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseRuntimeStepRepository(client: SupabaseClient): RuntimeStepRepository {
  return {
    async createStep(input) {
      const { data, error } = await client
        .from(STEPS_TABLE)
        .insert({
          execution_id: input.executionId,
          stage: input.stage,
          step_status: "running",
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapStep(data as Record<string, unknown>);
    },
    async completeStep(stepId, input) {
      const { data, error } = await client
        .from(STEPS_TABLE)
        .update({
          step_status: "completed",
          duration_ms: input.durationMs,
          metadata: input.metadata,
        })
        .eq("id", stepId)
        .select("*")
        .single();
      if (error) throw error;
      return mapStep(data as Record<string, unknown>);
    },
    async skipStep(stepId, input) {
      const { data, error } = await client
        .from(STEPS_TABLE)
        .update({
          step_status: "skipped",
          duration_ms: 0,
          metadata: input?.metadata,
        })
        .eq("id", stepId)
        .select("*")
        .single();
      if (error) throw error;
      return mapStep(data as Record<string, unknown>);
    },
    async failStep(stepId, input) {
      const { data, error } = await client
        .from(STEPS_TABLE)
        .update({
          step_status: "failed",
          duration_ms: input.durationMs,
          metadata: input.metadata,
        })
        .eq("id", stepId)
        .select("*")
        .single();
      if (error) throw error;
      return mapStep(data as Record<string, unknown>);
    },
    async listByExecution(executionId) {
      const { data, error } = await client
        .from(STEPS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => mapStep(row as Record<string, unknown>));
    },
  };
}

export function createSupabaseRuntimeErrorRepository(client: SupabaseClient): RuntimeErrorRepository {
  return {
    async saveError(input) {
      const { data, error } = await client
        .from(ERRORS_TABLE)
        .insert({
          execution_id: input.executionId,
          step_id: input.stepId ?? null,
          error_code: input.errorCode,
          error_category: input.errorCategory,
          human_message: input.humanMessage,
          developer_message: input.developerMessage,
          correlation_id: input.correlationId ?? null,
          recoverable: input.recoverable ?? false,
          metadata: input.metadata ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapError(data as Record<string, unknown>);
    },
    async listByExecution(executionId) {
      const { data, error } = await client
        .from(ERRORS_TABLE)
        .select("*")
        .eq("execution_id", executionId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => mapError(row as Record<string, unknown>));
    },
  };
}
