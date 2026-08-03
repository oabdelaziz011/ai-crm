import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandoffRepository } from "./handoff-repository-port.js";
import type {
  AgentPresenceRecord,
  ContextSnapshotRecord,
  EscalationRuleRecord,
  HandoffContextPayload,
  HandoffMetricsSnapshot,
  HandoffQueueRecord,
  HandoffRequestRecord,
  HandoffRequestStatus,
  HandoffRequestType,
  LifecycleState,
  OwnerType,
  OwnershipHistoryRecord,
  OwnershipRecord,
  PresenceState,
  QueueMemberRecord,
  RoutingStrategy,
} from "../types/handoff-types.js";

function mapOwnership(row: Record<string, unknown>): OwnershipRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    conversationId: String(row.conversation_id),
    ownerType: String(row.owner_type) as OwnerType,
    ownerId: row.owner_id ? String(row.owner_id) : null,
    ownerLabel: String(row.owner_label ?? ""),
    queueId: row.queue_id ? String(row.queue_id) : null,
    lifecycleState: String(row.lifecycle_state) as LifecycleState,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    aiAssistantId: row.ai_assistant_id ? String(row.ai_assistant_id) : null,
    isPaused: Boolean(row.is_paused),
    pausedAt: row.paused_at ? String(row.paused_at) : null,
    pausedReason: row.paused_reason ? String(row.paused_reason) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRequest(row: Record<string, unknown>): HandoffRequestRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    conversationId: String(row.conversation_id),
    requestType: String(row.request_type) as HandoffRequestType,
    status: String(row.status) as HandoffRequestStatus,
    fromOwnerType: row.from_owner_type ? (String(row.from_owner_type) as OwnerType) : null,
    fromOwnerId: row.from_owner_id ? String(row.from_owner_id) : null,
    toOwnerType: row.to_owner_type ? (String(row.to_owner_type) as OwnerType) : null,
    toOwnerId: row.to_owner_id ? String(row.to_owner_id) : null,
    toQueueId: row.to_queue_id ? String(row.to_queue_id) : null,
    reason: String(row.reason ?? ""),
    escalationReasonCode: row.escalation_reason_code ? String(row.escalation_reason_code) : null,
    priority: String(row.priority ?? "normal"),
    contextSnapshotId: row.context_snapshot_id ? String(row.context_snapshot_id) : null,
    requestedByUserId: row.requested_by_user_id ? String(row.requested_by_user_id) : null,
    requestedByAiAssistantId: row.requested_by_ai_assistant_id
      ? String(row.requested_by_ai_assistant_id)
      : null,
    acceptedByUserId: row.accepted_by_user_id ? String(row.accepted_by_user_id) : null,
    rejectedByUserId: row.rejected_by_user_id ? String(row.rejected_by_user_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

function mapQueue(row: Record<string, unknown>): HandoffQueueRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    routingStrategy: String(row.routing_strategy) as RoutingStrategy,
    departmentId: row.department_id ? String(row.department_id) : null,
    maxQueueSize: Number(row.max_queue_size ?? 500),
    overflowQueueId: row.overflow_queue_id ? String(row.overflow_queue_id) : null,
    businessHours: (row.business_hours as Record<string, unknown>) ?? {},
    skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
    languages: Array.isArray(row.languages) ? row.languages.map(String) : [],
    priorityWeight: Number(row.priority_weight ?? 0),
    isActive: Boolean(row.is_active),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPresence(row: Record<string, unknown>): AgentPresenceRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    userId: String(row.user_id),
    state: String(row.state) as PresenceState,
    viewingConversationId: row.viewing_conversation_id ? String(row.viewing_conversation_id) : null,
    lastHeartbeatAt: row.last_heartbeat_at ? String(row.last_heartbeat_at) : null,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    updatedAt: String(row.updated_at),
  };
}

export function createSupabaseHandoffRepository(client: SupabaseClient): HandoffRepository {
  return {
    async getOwnership(companyId, conversationId) {
      const { data, error } = await client
        .from("handoff_conversation_ownership")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapOwnership(data) : null;
    },

    async upsertOwnership(input) {
      const payload = {
        company_id: input.companyId,
        conversation_id: input.conversationId,
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        owner_label: input.ownerLabel,
        queue_id: input.queueId ?? null,
        lifecycle_state: input.lifecycleState,
        assigned_user_id: input.assignedUserId ?? null,
        ai_assistant_id: input.aiAssistantId ?? null,
        is_paused: input.isPaused ?? false,
        paused_at: input.pausedAt ?? null,
        paused_reason: input.pausedReason ?? null,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await client
        .from("handoff_conversation_ownership")
        .upsert(payload, { onConflict: "conversation_id" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapOwnership(data);
    },

    async appendOwnershipHistory(input) {
      const { data, error } = await client
        .from("handoff_ownership_history")
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          previous_owner_type: input.previousOwnerType,
          previous_owner_id: input.previousOwnerId,
          new_owner_type: input.newOwnerType,
          new_owner_id: input.newOwnerId,
          transition_action: input.transitionAction,
          transition_reason: input.transitionReason,
          actor_user_id: input.actorUserId,
          context_snapshot_id: input.contextSnapshotId ?? null,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        conversationId: String(data.conversation_id),
        previousOwnerType: data.previous_owner_type as OwnerType | null,
        previousOwnerId: data.previous_owner_id ? String(data.previous_owner_id) : null,
        newOwnerType: String(data.new_owner_type) as OwnerType,
        newOwnerId: data.new_owner_id ? String(data.new_owner_id) : null,
        transitionAction: String(data.transition_action),
        transitionReason: String(data.transition_reason ?? ""),
        actorUserId: data.actor_user_id ? String(data.actor_user_id) : null,
        contextSnapshotId: data.context_snapshot_id ? String(data.context_snapshot_id) : null,
        createdAt: String(data.created_at),
      } satisfies OwnershipHistoryRecord;
    },

    async listOwnershipHistory(companyId, conversationId, limit) {
      const { data, error } = await client
        .from("handoff_ownership_history")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        companyId: String(row.company_id),
        conversationId: String(row.conversation_id),
        previousOwnerType: row.previous_owner_type as OwnerType | null,
        previousOwnerId: row.previous_owner_id ? String(row.previous_owner_id) : null,
        newOwnerType: String(row.new_owner_type) as OwnerType,
        newOwnerId: row.new_owner_id ? String(row.new_owner_id) : null,
        transitionAction: String(row.transition_action),
        transitionReason: String(row.transition_reason ?? ""),
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        contextSnapshotId: row.context_snapshot_id ? String(row.context_snapshot_id) : null,
        createdAt: String(row.created_at),
      }));
    },

    async createRequest(input) {
      const { data, error } = await client
        .from("handoff_requests")
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          request_type: input.requestType,
          status: "pending",
          from_owner_type: input.fromOwnerType,
          from_owner_id: input.fromOwnerId,
          to_owner_type: input.toOwnerType,
          to_owner_id: input.toOwnerId,
          to_queue_id: input.toQueueId ?? null,
          reason: input.reason,
          escalation_reason_code: input.escalationReasonCode ?? null,
          priority: input.priority ?? "normal",
          context_snapshot_id: input.contextSnapshotId ?? null,
          requested_by_user_id: input.requestedByUserId ?? null,
          requested_by_ai_assistant_id: input.requestedByAiAssistantId ?? null,
          expires_at: input.expiresAt ?? null,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapRequest(data);
    },

    async updateRequestStatus(input) {
      const patch: Record<string, unknown> = {
        status: input.status,
        updated_at: new Date().toISOString(),
      };
      if (input.acceptedByUserId !== undefined) patch.accepted_by_user_id = input.acceptedByUserId;
      if (input.rejectedByUserId !== undefined) patch.rejected_by_user_id = input.rejectedByUserId;
      const { data, error } = await client
        .from("handoff_requests")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.requestId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapRequest(data);
    },

    async getRequest(companyId, requestId) {
      const { data, error } = await client
        .from("handoff_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", requestId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRequest(data) : null;
    },

    async getPendingRequest(companyId, conversationId) {
      const { data, error } = await client
        .from("handoff_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapRequest(data) : null;
    },

    async listPendingRequests(input) {
      let query = client
        .from("handoff_requests")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(input.limit);
      if (input.queueId) query = query.eq("to_queue_id", input.queueId);
      if (input.assigneeUserId) query = query.eq("to_owner_id", input.assigneeUserId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapRequest);
    },

    async createContextSnapshot(input) {
      const { data, error } = await client
        .from("handoff_context_snapshots")
        .insert({
          company_id: input.companyId,
          conversation_id: input.conversationId,
          summary: input.summary,
          suggested_resolution: input.suggestedResolution,
          suggested_reply: input.suggestedReply,
          payload: input.payload,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        conversationId: String(data.conversation_id),
        summary: String(data.summary),
        suggestedResolution: String(data.suggested_resolution),
        suggestedReply: String(data.suggested_reply),
        payload: (data.payload as HandoffContextPayload) ?? {},
        createdAt: String(data.created_at),
      } satisfies ContextSnapshotRecord;
    },

    async getLatestContextSnapshot(companyId, conversationId) {
      const { data, error } = await client
        .from("handoff_context_snapshots")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        conversationId: String(data.conversation_id),
        summary: String(data.summary),
        suggestedResolution: String(data.suggested_resolution),
        suggestedReply: String(data.suggested_reply),
        payload: (data.payload as HandoffContextPayload) ?? {},
        createdAt: String(data.created_at),
      };
    },

    async listQueues(companyId, activeOnly) {
      let query = client
        .from("handoff_queues")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapQueue);
    },

    async getQueue(companyId, queueId) {
      const { data, error } = await client
        .from("handoff_queues")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", queueId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapQueue(data) : null;
    },

    async countQueueWaiting(companyId, queueId) {
      const { count, error } = await client
        .from("handoff_conversation_ownership")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("queue_id", queueId)
        .eq("owner_type", "queue");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async listQueueMembers(companyId, queueId) {
      const { data, error } = await client
        .from("handoff_queue_members")
        .select("*")
        .eq("company_id", companyId)
        .eq("queue_id", queueId)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): QueueMemberRecord => ({
          id: String(row.id),
          queueId: String(row.queue_id),
          companyId: String(row.company_id),
          userId: String(row.user_id),
          skills: Array.isArray(row.skills) ? row.skills.map(String) : [],
          languages: Array.isArray(row.languages) ? row.languages.map(String) : [],
          isActive: Boolean(row.is_active),
          lastAssignedAt: row.last_assigned_at ? String(row.last_assigned_at) : null,
          activeConversationCount: Number(row.active_conversation_count ?? 0),
        }),
      );
    },

    async incrementMemberAssignment(queueId, userId) {
      const { error } = await client.rpc("handoff_increment_member_assignment", {
        p_queue_id: queueId,
        p_user_id: userId,
      });
      if (error) {
        await client
          .from("handoff_queue_members")
          .update({
            last_assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("queue_id", queueId)
          .eq("user_id", userId);
      }
    },

    async upsertPresence(input) {
      const now = new Date().toISOString();
      const { data, error } = await client
        .from("agent_presence")
        .upsert(
          {
            company_id: input.companyId,
            user_id: input.userId,
            state: input.state,
            viewing_conversation_id: input.viewingConversationId ?? null,
            last_heartbeat_at: input.lastHeartbeatAt ?? now,
            last_seen_at: now,
            updated_at: now,
          },
          { onConflict: "company_id,user_id" },
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapPresence(data);
    },

    async getPresence(companyId, userId) {
      const { data, error } = await client
        .from("agent_presence")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapPresence(data) : null;
    },

    async listPresence(companyId, states) {
      let query = client.from("agent_presence").select("*").eq("company_id", companyId);
      if (states?.length) query = query.in("state", states);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPresence);
    },

    async expireStalePresence(companyId, cutoffIso) {
      const { data, error } = await client
        .from("agent_presence")
        .update({ state: "offline", updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .in("state", ["online", "busy", "away"])
        .lt("last_heartbeat_at", cutoffIso)
        .select("id");
      if (error) throw new Error(error.message);
      return data?.length ?? 0;
    },

    async listEscalationRules(companyId, activeOnly) {
      let query = client
        .from("handoff_escalation_rules")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null);
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): EscalationRuleRecord => ({
          id: String(row.id),
          companyId: String(row.company_id),
          name: String(row.name),
          triggerCode: String(row.trigger_code) as EscalationRuleRecord["triggerCode"],
          targetQueueId: row.target_queue_id ? String(row.target_queue_id) : null,
          targetLevel: String(row.target_level),
          priorityBoost: String(row.priority_boost),
          conditions: (row.conditions as Record<string, unknown>) ?? {},
          isActive: Boolean(row.is_active),
        }),
      );
    },

    async findEscalationRule(companyId, triggerCode) {
      const { data, error } = await client
        .from("handoff_escalation_rules")
        .select("*")
        .eq("company_id", companyId)
        .eq("trigger_code", triggerCode)
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        name: String(data.name),
        triggerCode: String(data.trigger_code) as EscalationRuleRecord["triggerCode"],
        targetQueueId: data.target_queue_id ? String(data.target_queue_id) : null,
        targetLevel: String(data.target_level),
        priorityBoost: String(data.priority_boost),
        conditions: (data.conditions as Record<string, unknown>) ?? {},
        isActive: Boolean(data.is_active),
      };
    },

    async fetchMetrics(companyId, periodStartIso) {
      const { data, error } = await client.rpc("handoff_platform_company_metrics_v1", {
        p_company_id: companyId,
        p_period_start: periodStartIso,
      });
      if (error) throw new Error(error.message);
      const metrics = (data as Record<string, unknown>) ?? {};
      return {
        transferCount: Number(metrics.transferCount ?? 0),
        escalationReasons: (metrics.escalationReasons as Record<string, number>) ?? {},
        escalationCount: Number(metrics.escalationCount ?? 0),
        averageWaitTimeSeconds: Number(metrics.averageWaitTimeSeconds ?? 0),
        queuePerformance: (metrics.queuePerformance as HandoffMetricsSnapshot["queuePerformance"]) ?? [],
        aiResolutionRate: Number(metrics.aiResolutionRate ?? 0),
        humanResolutionRate: Number(metrics.humanResolutionRate ?? 0),
        agentUtilization: (metrics.agentUtilization as HandoffMetricsSnapshot["agentUtilization"]) ?? [],
      };
    },
  };
}
