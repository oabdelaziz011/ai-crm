import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTOMATION_SESSION_MESSAGES_TABLE } from "../constants.js";
import type {
  AutomationEdgeRecord,
  AutomationFlowRecord,
  AutomationNodeRecord,
  AutomationRunRecord,
  ConversationMessageRecord,
  ConversationSessionRecord,
  CreateAutomationEdgeInput,
  CreateAutomationFlowInput,
  CreateAutomationNodeInput,
  CreateAutomationRunInput,
  CreateConversationMessageInput,
  CreateConversationSessionInput,
  ListAutomationFlowsFilter,
  ListAutomationRunsFilter,
  ListConversationMessagesFilter,
  ListConversationSessionsFilter,
  SoftDeleteInput,
  UpdateAutomationFlowInput,
  UpdateAutomationRunStateInput,
  UpdateConversationSessionStateInput,
} from "../types.js";
import type {
  AutomationEdgeRepository,
  AutomationFlowRepository,
  AutomationNodeRepository,
  AutomationRunRepository,
  ConversationMessageRepository,
  ConversationSessionRepository,
} from "./automation-repositories.js";

const FLOWS_TABLE = "automation_flows";
const NODES_TABLE = "automation_nodes";
const EDGES_TABLE = "automation_edges";
const RUNS_TABLE = "automation_runs";
const SESSIONS_TABLE = "conversation_sessions";

function mapFlow(row: Record<string, unknown>): AutomationFlowRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    trigger_type: row.trigger_type as AutomationFlowRecord["trigger_type"],
    status: row.status as AutomationFlowRecord["status"],
    version: Number(row.version ?? 1),
    active_version_id: (row.active_version_id as string | null) ?? null,
    has_unpublished_draft: Boolean(row.has_unpublished_draft ?? true),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_by: (row.created_by as string | null) ?? null,
    updated_by: (row.updated_by as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
  };
}

function mapNode(row: Record<string, unknown>): AutomationNodeRecord {
  return {
    id: row.id as string,
    flow_id: row.flow_id as string,
    type: row.type as AutomationNodeRecord["type"],
    config: (row.config as Record<string, unknown>) ?? {},
    position_x: Number(row.position_x ?? 0),
    position_y: Number(row.position_y ?? 0),
    created_at: row.created_at as string,
  };
}

function mapEdge(row: Record<string, unknown>): AutomationEdgeRecord {
  return {
    id: row.id as string,
    flow_id: row.flow_id as string,
    source_node_id: row.source_node_id as string,
    target_node_id: row.target_node_id as string,
    condition: (row.condition as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

function mapRun(row: Record<string, unknown>): AutomationRunRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    flow_id: row.flow_id as string,
    status: row.status as AutomationRunRecord["status"],
    trigger_source: row.trigger_source as string,
    started_at: row.started_at as string,
    finished_at: (row.finished_at as string | null) ?? null,
    error_message: (row.error_message as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    flow_version_id: (row.flow_version_id as string | null) ?? null,
    current_node_id: (row.current_node_id as string | null) ?? null,
    session_id: (row.session_id as string | null) ?? null,
    variables: (row.variables as Record<string, unknown>) ?? {},
  };
}

function mapSession(row: Record<string, unknown>): ConversationSessionRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    channel: row.channel as ConversationSessionRecord["channel"],
    external_user_id: (row.external_user_id as string | null) ?? null,
    customer_id: (row.customer_id as string | null) ?? null,
    flow_id: (row.flow_id as string | null) ?? null,
    flow_version_id: (row.flow_version_id as string | null) ?? null,
    run_id: (row.run_id as string | null) ?? null,
    current_node_id: (row.current_node_id as string | null) ?? null,
    status: row.status as ConversationSessionRecord["status"],
    started_at: row.started_at as string,
    last_activity_at: row.last_activity_at as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    variables: (row.variables as Record<string, unknown>) ?? {},
  };
}

function mapMessage(row: Record<string, unknown>): ConversationMessageRecord {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    sender_type: row.sender_type as ConversationMessageRecord["sender_type"],
    message_type: row.message_type as ConversationMessageRecord["message_type"],
    payload: (row.payload as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

export function createSupabaseAutomationFlowRepository(client: SupabaseClient): AutomationFlowRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(FLOWS_TABLE)
        .insert({
          company_id: input.companyId,
          name: input.name,
          description: input.description ?? "",
          trigger_type: input.triggerType,
          metadata: input.metadata ?? {},
          created_by: input.createdBy ?? null,
          updated_by: input.createdBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapFlow(data);
    },
    async update(input) {
      const patch: Record<string, unknown> = { updated_by: input.updatedBy ?? null };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      if (input.triggerType !== undefined) patch.trigger_type = input.triggerType;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      if (input.activeVersionId !== undefined) patch.active_version_id = input.activeVersionId;
      if (input.version !== undefined) patch.version = input.version;
      if (input.hasUnpublishedDraft !== undefined) patch.has_unpublished_draft = input.hasUnpublishedDraft;
      if (input.status !== undefined) patch.status = input.status;
      const { data, error } = await client
        .from(FLOWS_TABLE)
        .update(patch)
        .eq("id", input.flowId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapFlow(data);
    },
    async updateStatus(flowId, status, updatedBy) {
      const { data, error } = await client
        .from(FLOWS_TABLE)
        .update({ status, updated_by: updatedBy ?? null })
        .eq("id", flowId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapFlow(data);
    },
    async softDelete(input) {
      const { data, error } = await client
        .from(FLOWS_TABLE)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: input.deletedBy ?? null,
          status: "disabled",
          updated_by: input.deletedBy ?? null,
        })
        .eq("id", input.id)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapFlow(data);
    },
    async findById(id) {
      const { data, error } = await client.from(FLOWS_TABLE).select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      return data ? mapFlow(data) : null;
    },
    async findByName(companyId, name) {
      const { data, error } = await client
        .from(FLOWS_TABLE)
        .select("*")
        .eq("company_id", companyId)
        .eq("name", name)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapFlow(data) : null;
    },
    async list(filter) {
      let query = client
        .from(FLOWS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.triggerType) query = query.eq("trigger_type", filter.triggerType);
      if (filter.search?.trim()) query = query.ilike("name", `%${filter.search.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapFlow);
    },
  };
}

export function createSupabaseAutomationNodeRepository(client: SupabaseClient): AutomationNodeRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(NODES_TABLE)
        .insert({
          flow_id: input.flowId,
          type: input.type,
          config: input.config ?? {},
          position_x: input.positionX ?? 0,
          position_y: input.positionY ?? 0,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapNode(data);
    },
    async listByFlowId(flowId) {
      const { data, error } = await client.from(NODES_TABLE).select("*").eq("flow_id", flowId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapNode);
    },
    async deleteByFlowId(flowId) {
      const { error } = await client.from(NODES_TABLE).delete().eq("flow_id", flowId);
      if (error) throw error;
    },
  };
}

export function createSupabaseAutomationEdgeRepository(client: SupabaseClient): AutomationEdgeRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(EDGES_TABLE)
        .insert({
          flow_id: input.flowId,
          source_node_id: input.sourceNodeId,
          target_node_id: input.targetNodeId,
          condition: input.condition ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapEdge(data);
    },
    async listByFlowId(flowId) {
      const { data, error } = await client.from(EDGES_TABLE).select("*").eq("flow_id", flowId).order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapEdge);
    },
    async deleteByFlowId(flowId) {
      const { error } = await client.from(EDGES_TABLE).delete().eq("flow_id", flowId);
      if (error) throw error;
    },
  };
}

export function createSupabaseAutomationRunRepository(client: SupabaseClient): AutomationRunRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(RUNS_TABLE)
        .insert({
          company_id: input.companyId,
          flow_id: input.flowId,
          trigger_source: input.triggerSource ?? "manual",
          status: input.status ?? "pending",
          metadata: input.metadata ?? {},
          variables: input.variables ?? {},
          flow_version_id: input.flowVersionId ?? null,
          current_node_id: input.currentNodeId ?? null,
          session_id: input.sessionId ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapRun(data);
    },
    async findById(id) {
      const { data, error } = await client.from(RUNS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapRun(data) : null;
    },
    async findBySessionId(sessionId) {
      const { data, error } = await client
        .from(RUNS_TABLE)
        .select("*")
        .eq("session_id", sessionId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRun(data) : null;
    },
    async findLatestResumableForExternalUser(input) {
      const { data, error } = await client
        .from(RUNS_TABLE)
        .select("*, conversation_sessions!automation_runs_session_id_fkey(*)")
        .eq("company_id", input.companyId)
        .eq("status", "waiting_input")
        .eq("flow_id", input.boundFlowId)
        .eq("conversation_sessions.channel", input.channel)
        .eq("conversation_sessions.external_user_id", input.externalUserId)
        .eq("conversation_sessions.status", "waiting_input")
        .gte("conversation_sessions.last_activity_at", input.activitySince)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const sessionRow = (data as { conversation_sessions?: Record<string, unknown> })
        .conversation_sessions;
      if (!sessionRow || typeof sessionRow !== "object") return null;

      return {
        run: mapRun(data as Record<string, unknown>),
        session: mapSession(sessionRow),
      };
    },
    async list(filter) {
      let query = client
        .from(RUNS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("started_at", { ascending: false });
      if (filter.flowId) query = query.eq("flow_id", filter.flowId);
      if (filter.status) query = query.eq("status", filter.status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapRun);
    },
    async updateState(input) {
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.flowVersionId !== undefined) patch.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) patch.current_node_id = input.currentNodeId;
      if (input.sessionId !== undefined) patch.session_id = input.sessionId;
      if (input.variables !== undefined) patch.variables = input.variables;
      if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;
      if (input.finishedAt !== undefined) patch.finished_at = input.finishedAt;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      let query = client.from(RUNS_TABLE).update(patch).eq("id", input.runId);
      if (input.expectedStatus !== undefined) {
        query = query.eq("status", input.expectedStatus);
      }
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(`Automation run ${input.runId} state changed concurrently (expected status ${String(input.expectedStatus)}).`);
      }
      return mapRun(data);
    },
  };
}

export function createSupabaseConversationSessionRepository(client: SupabaseClient): ConversationSessionRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(SESSIONS_TABLE)
        .insert({
          company_id: input.companyId,
          channel: input.channel,
          external_user_id: input.externalUserId ?? null,
          customer_id: input.customerId ?? null,
          flow_id: input.flowId ?? null,
          run_id: input.runId ?? null,
          flow_version_id: input.flowVersionId ?? null,
          current_node_id: input.currentNodeId ?? null,
          status: input.status ?? "active",
          metadata: input.metadata ?? {},
          variables: input.variables ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapSession(data);
    },
    async findById(id) {
      const { data, error } = await client.from(SESSIONS_TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapSession(data) : null;
    },
    async findActiveSession(input) {
      let query = client
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("company_id", input.companyId)
        .eq("channel", input.channel)
        .eq("external_user_id", input.externalUserId)
        .in("status", ["active", "running", "waiting_input", "paused"]);

      if (input.activitySince) {
        query = query.gte("last_activity_at", input.activitySince);
      }

      if (input.preferStatus) {
        query = query.eq("status", input.preferStatus);
      }

      const { data, error } = await query
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapSession(data) : null;
    },
    async list(filter) {
      let query = client
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("company_id", filter.companyId)
        .order("last_activity_at", { ascending: false });
      if (filter.flowId) query = query.eq("flow_id", filter.flowId);
      if (filter.status) query = query.eq("status", filter.status);
      if (filter.channel) query = query.eq("channel", filter.channel);
      if (filter.externalUserId) query = query.eq("external_user_id", filter.externalUserId);
      if (filter.activeOnly) query = query.in("status", ["active", "running", "waiting_input", "paused"]);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapSession);
    },
    async updateState(input) {
      const patch: Record<string, unknown> = {
        last_activity_at: input.lastActivityAt ?? new Date().toISOString(),
      };
      if (input.status !== undefined) patch.status = input.status;
      if (input.flowVersionId !== undefined) patch.flow_version_id = input.flowVersionId;
      if (input.currentNodeId !== undefined) patch.current_node_id = input.currentNodeId;
      if (input.runId !== undefined) patch.run_id = input.runId;
      if (input.variables !== undefined) patch.variables = input.variables;
      if (input.metadata !== undefined) patch.metadata = input.metadata;
      const { data, error } = await client.from(SESSIONS_TABLE).update(patch).eq("id", input.sessionId).select("*").single();
      if (error) throw error;
      return mapSession(data);
    },
  };
}

export function createSupabaseConversationMessageRepository(client: SupabaseClient): ConversationMessageRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(AUTOMATION_SESSION_MESSAGES_TABLE)
        .insert({
          session_id: input.sessionId,
          sender_type: input.senderType,
          message_type: input.messageType ?? "text",
          payload: input.payload ?? {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapMessage(data);
    },
    async list(filter) {
      const { data, error } = await client
        .from(AUTOMATION_SESSION_MESSAGES_TABLE)
        .select("*")
        .eq("session_id", filter.sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapMessage);
    },
  };
}
