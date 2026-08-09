import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadRepository } from "./lead-repository-port.js";
import type {
  LeadActivityRecord,
  LeadAssignmentRecord,
  LeadHistoryRecord,
  LeadLifecycleStatus,
  LeadMetricsSnapshot,
  LeadNoteRecord,
  LeadPipelineRecord,
  LeadPriority,
  LeadRecord,
  LeadSourceRecord,
  LeadStageRecord,
  LeadSummary,
  LeadTagRecord,
  PipelineMetricsSnapshot,
} from "../types/lead-types.js";
import { toLeadSummary } from "../types/lead-types.js";

function mapLead(row: Record<string, unknown>): LeadRecord {
  const temperatureRaw = row.temperature != null ? String(row.temperature) : null;
  const temperature =
    temperatureRaw === "hot" || temperatureRaw === "warm" || temperatureRaw === "cold"
      ? temperatureRaw
      : null;
  const tagsRaw = row.tags;
  const tags = Array.isArray(tagsRaw)
    ? tagsRaw.map((tag) => String(tag)).filter(Boolean)
    : [];

  return {
    id: String(row.id),
    companyId: String(row.company_id),
    pipelineId: String(row.pipeline_id),
    stageId: String(row.stage_id),
    sourceId: row.source_id ? String(row.source_id) : null,
    lifecycleStatus: String(row.lifecycle_status) as LeadLifecycleStatus,
    title: String(row.title ?? row.name ?? "").trim() || String(row.contact_name ?? "").trim() || "Untitled lead",
    contactName: String(row.contact_name ?? ""),
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    companyName: row.company_name ? String(row.company_name) : null,
    priority: String(row.priority) as LeadPriority,
    estimatedValue:
      row.estimated_value != null && String(row.estimated_value).trim() !== ""
        ? Number(row.estimated_value)
        : null,
    currency: String(row.currency ?? "USD"),
    score: Number(row.score ?? 0),
    isQualified:
      Boolean(row.is_qualified) || String(row.lifecycle_status ?? "").toLowerCase() === "qualified",
    isVip: Boolean(row.is_vip),
    language: row.language ? String(row.language) : null,
    territory: row.territory ? String(row.territory) : null,
    department: row.department ? String(row.department) : null,
    assignedUserId: row.assigned_user_id ? String(row.assigned_user_id) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    qualifiedAt: row.qualified_at ? String(row.qualified_at) : null,
    convertedAt: row.converted_at ? String(row.converted_at) : null,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    expectedCloseDate: row.expected_close_date ? String(row.expected_close_date) : null,
    temperature,
    notes: String(row.notes ?? ""),
    tags,
    lastActivityAt: row.last_activity_at
      ? String(row.last_activity_at)
      : row.updated_at
        ? String(row.updated_at)
        : null,
    aiSummary: String(row.ai_summary ?? ""),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapPipeline(row: Record<string, unknown>): LeadPipelineRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    description: String(row.description ?? ""),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    // Pre-migration rows / missing column → allow backward (sprint default).
    allowBackwardStageMovement: row.allow_backward_stage_movement !== false,
  };
}

function mapStage(row: Record<string, unknown>): LeadStageRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    pipelineId: String(row.pipeline_id),
    name: String(row.name),
    slug: String(row.slug),
    lifecycleStatus: String(row.lifecycle_status) as LeadLifecycleStatus,
    sortOrder: Number(row.sort_order ?? 0),
    probabilityPercent: Number(row.probability_percent ?? 0),
    isTerminal: Boolean(row.is_terminal),
  };
}

function mapSource(row: Record<string, unknown>): LeadSourceRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    channelType: row.channel_type ? String(row.channel_type) : null,
    isActive: Boolean(row.is_active ?? true),
  };
}

export function createSupabaseLeadRepository(client: SupabaseClient): LeadRepository {
  return {
    async ensureDefaultPipeline(companyId) {
      const { data, error } = await client.rpc("lead_platform_ensure_default_pipeline", {
        p_company_id: companyId,
      });
      if (error) throw new Error(error.message);
      return String(data);
    },

    async getDefaultStage(companyId, pipelineId) {
      const { data, error } = await client
        .from("lead_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_id", pipelineId)
        .eq("slug", "new")
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapStage(data) : null;
    },

    async createLead(input) {
      const nowIso = new Date().toISOString();
      const { data, error } = await client
        .from("leads")
        .insert({
          company_id: input.companyId,
          pipeline_id: input.pipelineId,
          stage_id: input.stageId,
          source_id: input.sourceId ?? null,
          lifecycle_status: input.lifecycleStatus,
          title: input.title,
          contact_name: input.contactName ?? "",
          email: input.email ?? null,
          phone: input.phone ?? null,
          company_name: input.companyName ?? null,
          priority: input.priority ?? "normal",
          estimated_value: input.estimatedValue ?? null,
          conversation_id: input.conversationId ?? null,
          language: input.language ?? null,
          territory: input.territory ?? null,
          department: input.department ?? null,
          assigned_user_id: input.assignedUserId ?? null,
          expected_close_date: input.expectedCloseDate ?? null,
          temperature: input.temperature ?? null,
          notes: input.notes ?? "",
          tags: input.tags ?? [],
          last_activity_at: input.lastActivityAt ?? nowIso,
          is_vip: input.isVip ?? false,
          ai_summary: input.aiSummary ?? "",
          metadata: input.metadata ?? {},
          ...(input.currency ? { currency: input.currency } : {}),
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapLead(data);
    },

    async updateLead(input) {
      const patch: Record<string, unknown> = { updated_by: input.updatedBy, updated_at: new Date().toISOString() };
      if (input.title !== undefined) patch.title = input.title;
      if (input.contactName !== undefined) patch.contact_name = input.contactName;
      if (input.email !== undefined) patch.email = input.email;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.companyName !== undefined) patch.company_name = input.companyName;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.estimatedValue !== undefined) patch.estimated_value = input.estimatedValue;
      if (input.score !== undefined) patch.score = input.score;
      if (input.isQualified !== undefined) patch.is_qualified = input.isQualified;
      if (input.lifecycleStatus !== undefined) patch.lifecycle_status = input.lifecycleStatus;
      if (input.stageId !== undefined) patch.stage_id = input.stageId;
      if (input.pipelineId !== undefined) patch.pipeline_id = input.pipelineId;
      if (input.sourceId !== undefined) patch.source_id = input.sourceId;
      if (input.assignedUserId !== undefined) patch.assigned_user_id = input.assignedUserId;
      if (input.customerId !== undefined) patch.customer_id = input.customerId;
      if (input.qualifiedAt !== undefined) patch.qualified_at = input.qualifiedAt;
      if (input.convertedAt !== undefined) patch.converted_at = input.convertedAt;
      if (input.archivedAt !== undefined) patch.archived_at = input.archivedAt;
      if (input.expectedCloseDate !== undefined) patch.expected_close_date = input.expectedCloseDate;
      if (input.temperature !== undefined) patch.temperature = input.temperature;
      if (input.notes !== undefined) patch.notes = input.notes;
      if (input.tags !== undefined) patch.tags = input.tags;
      if (input.lastActivityAt !== undefined) patch.last_activity_at = input.lastActivityAt;
      if (input.aiSummary !== undefined) patch.ai_summary = input.aiSummary;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      const { data, error } = await client
        .from("leads")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.leadId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapLead(data);
    },

    async softDeleteLead(companyId, leadId, updatedBy) {
      const { error } = await client
        .from("leads")
        .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
        .eq("company_id", companyId)
        .eq("id", leadId);
      if (error) throw new Error(error.message);
    },

    async getLead(companyId, leadId) {
      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", leadId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapLead(data) : null;
    },

    async getLeadByConversation(companyId, conversationId) {
      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapLead(data) : null;
    },

    async getLeadByCustomer(companyId, customerId) {
      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .order("converted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapLead(data) : null;
    },

    async searchLeads(input) {
      let query = client
        .from("leads")
        .select("*", { count: "exact" })
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.lifecycleStatus) query = query.eq("lifecycle_status", input.lifecycleStatus);
      if (input.stageId) query = query.eq("stage_id", input.stageId);
      if (input.pipelineId) query = query.eq("pipeline_id", input.pipelineId);
      if (input.assignedUserId) query = query.eq("assigned_user_id", input.assignedUserId);
      if (input.isQualified !== undefined) query = query.eq("is_qualified", input.isQualified);
      if (input.query) {
        const q = `%${input.query}%`;
        query = query.or(`title.ilike.${q},contact_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`);
      }

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      return { leads: (data ?? []).map((row) => toLeadSummary(mapLead(row))), total: count ?? 0 };
    },

    async listPipelines(companyId) {
      const { data, error } = await client
        .from("lead_pipelines")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapPipeline);
    },

    async getPipeline(companyId, pipelineId) {
      const { data, error } = await client
        .from("lead_pipelines")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", pipelineId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapPipeline(data) : null;
    },

    async listStages(companyId, pipelineId) {
      const { data, error } = await client
        .from("lead_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_id", pipelineId)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapStage);
    },

    async getStage(companyId, stageId) {
      const { data, error } = await client
        .from("lead_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", stageId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? mapStage(data) : null;
    },

    async listSources(companyId) {
      const { data, error } = await client
        .from("lead_sources")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapSource);
    },

    async ensureDefaultSources(companyId) {
      const existing = await this.listSources(companyId);
      if (existing.length > 0) return existing;

      const defaults = [
        { name: "Website", slug: "website", channel_type: "web" },
        { name: "Referral", slug: "referral", channel_type: "referral" },
        { name: "Email", slug: "email", channel_type: "email" },
        { name: "Phone", slug: "phone", channel_type: "phone" },
        { name: "WhatsApp", slug: "whatsapp", channel_type: "whatsapp" },
      ];
      const { error } = await client.from("lead_sources").insert(
        defaults.map((source) => ({
          company_id: companyId,
          name: source.name,
          slug: source.slug,
          channel_type: source.channel_type,
          is_active: true,
        })),
      );
      if (error && !/duplicate|unique/i.test(error.message)) {
        throw new Error(error.message);
      }
      return this.listSources(companyId);
    },

    async createAssignment(input) {
      await this.deactivateAssignments(input.companyId, input.leadId);
      const { data, error } = await client
        .from("lead_assignments")
        .insert({
          company_id: input.companyId,
          lead_id: input.leadId,
          assigned_user_id: input.assignedUserId,
          assignment_method: input.assignmentMethod,
          assigned_by: input.assignedBy,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        leadId: String(data.lead_id),
        assignedUserId: String(data.assigned_user_id),
        assignmentMethod: String(data.assignment_method) as LeadAssignmentRecord["assignmentMethod"],
        assignedBy: data.assigned_by ? String(data.assigned_by) : null,
        isActive: Boolean(data.is_active),
        assignedAt: String(data.assigned_at),
      };
    },

    async deactivateAssignments(companyId, leadId) {
      await client
        .from("lead_assignments")
        .update({ is_active: false, released_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .eq("is_active", true);
    },

    async addNote(input) {
      const { data, error } = await client
        .from("lead_notes")
        .insert({
          company_id: input.companyId,
          lead_id: input.leadId,
          body: input.body,
          is_internal: input.isInternal,
          created_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        leadId: String(data.lead_id),
        body: String(data.body),
        isInternal: Boolean(data.is_internal),
        createdBy: data.created_by ? String(data.created_by) : null,
        createdAt: String(data.created_at),
      };
    },

    async addTag(input) {
      const { data, error } = await client
        .from("lead_tags")
        .upsert(
          {
            company_id: input.companyId,
            lead_id: input.leadId,
            tag: input.tag,
            created_by: input.createdBy,
            deleted_at: null,
          },
          { onConflict: "lead_id,tag" },
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        leadId: String(data.lead_id),
        tag: String(data.tag),
        createdAt: String(data.created_at),
      };
    },

    async removeTag(companyId, leadId, tag) {
      const { error } = await client
        .from("lead_tags")
        .update({ deleted_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .eq("tag", tag);
      if (error) throw new Error(error.message);
    },

    async listTags(companyId, leadId) {
      const { data, error } = await client
        .from("lead_tags")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .is("deleted_at", null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): LeadTagRecord => ({
          id: String(row.id),
          companyId: String(row.company_id),
          leadId: String(row.lead_id),
          tag: String(row.tag),
          createdAt: String(row.created_at),
        }),
      );
    },

    async listNotes(companyId, leadId) {
      const { data, error } = await client
        .from("lead_notes")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): LeadNoteRecord => ({
          id: String(row.id),
          companyId: String(row.company_id),
          leadId: String(row.lead_id),
          body: String(row.body),
          isInternal: Boolean(row.is_internal),
          createdBy: row.created_by ? String(row.created_by) : null,
          createdAt: String(row.created_at),
        }),
      );
    },

    async appendActivity(input) {
      const { data, error } = await client
        .from("lead_activities")
        .insert({
          company_id: input.companyId,
          lead_id: input.leadId,
          activity_type: input.activityType,
          summary: input.summary,
          payload: input.payload ?? {},
          actor_user_id: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        leadId: String(data.lead_id),
        activityType: String(data.activity_type),
        summary: String(data.summary),
        payload: (data.payload as Record<string, unknown>) ?? {},
        actorUserId: data.actor_user_id ? String(data.actor_user_id) : null,
        createdAt: String(data.created_at),
      };
    },

    async appendHistory(input) {
      const { data, error } = await client
        .from("lead_history")
        .insert({
          company_id: input.companyId,
          lead_id: input.leadId,
          field_name: input.fieldName,
          previous_value: input.previousValue,
          new_value: input.newValue,
          change_action: input.changeAction,
          actor_user_id: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return {
        id: String(data.id),
        companyId: String(data.company_id),
        leadId: String(data.lead_id),
        fieldName: String(data.field_name),
        previousValue: data.previous_value ? String(data.previous_value) : null,
        newValue: data.new_value ? String(data.new_value) : null,
        changeAction: String(data.change_action),
        actorUserId: data.actor_user_id ? String(data.actor_user_id) : null,
        createdAt: String(data.created_at),
      };
    },

    async listActivities(companyId, leadId, limit) {
      const { data, error } = await client
        .from("lead_activities")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): LeadActivityRecord => ({
          id: String(row.id),
          companyId: String(row.company_id),
          leadId: String(row.lead_id),
          activityType: String(row.activity_type),
          summary: String(row.summary),
          payload: (row.payload as Record<string, unknown>) ?? {},
          actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
          createdAt: String(row.created_at),
        }),
      );
    },

    async listHistory(companyId, leadId, limit) {
      const { data, error } = await client
        .from("lead_history")
        .select("*")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (row): LeadHistoryRecord => ({
          id: String(row.id),
          companyId: String(row.company_id),
          leadId: String(row.lead_id),
          fieldName: String(row.field_name),
          previousValue: row.previous_value ? String(row.previous_value) : null,
          newValue: row.new_value ? String(row.new_value) : null,
          changeAction: String(row.change_action),
          actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
          createdAt: String(row.created_at),
        }),
      );
    },

    async recordConversion(input) {
      const { error } = await client.from("lead_conversion_history").insert({
        company_id: input.companyId,
        lead_id: input.leadId,
        customer_id: input.customerId,
        opportunity_id: input.opportunityId ?? null,
        converted_by: input.convertedBy,
        preserved_payload: input.preservedPayload,
      });
      if (error) throw new Error(error.message);
    },

    async mergeLeads(input) {
      for (const duplicateId of input.duplicateLeadIds) {
        await client
          .from("leads")
          .update({ deleted_at: new Date().toISOString(), updated_by: input.updatedBy })
          .eq("company_id", input.companyId)
          .eq("id", duplicateId);
        await this.appendActivity({
          companyId: input.companyId,
          leadId: input.primaryLeadId,
          activityType: "merge",
          summary: `Merged lead ${duplicateId}`,
          actorUserId: input.updatedBy,
        });
      }
      const lead = await this.getLead(input.companyId, input.primaryLeadId);
      if (!lead) throw new Error("Primary lead not found after merge");
      return lead;
    },

    async fetchMetrics(companyId, periodStartIso) {
      const { data, error } = await client.rpc("lead_platform_company_metrics_v1", {
        p_company_id: companyId,
        p_period_start: periodStartIso,
      });
      if (error) throw new Error(error.message);
      const m = (data as Record<string, unknown>) ?? {};
      return {
        totalLeads: Number(m.totalLeads ?? 0),
        leadsByStatus: (m.leadsByStatus as Record<string, number>) ?? {},
        pipelineMetrics: (m.pipelineMetrics as LeadMetricsSnapshot["pipelineMetrics"]) ?? [],
        conversionsInPeriod: Number(m.conversionsInPeriod ?? 0),
        createdInPeriod: Number(m.createdInPeriod ?? 0),
        forecastValue: Number(m.forecastValue ?? 0),
        conversionRate: Number(m.conversionRate ?? 0),
      };
    },

    async fetchPipelineMetrics(companyId, pipelineId) {
      const pipeline = await this.getPipeline(companyId, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      const stages = await this.listStages(companyId, pipelineId);
      const stageMetrics = await Promise.all(
        stages.map(async (stage) => {
          const { count, data } = await client
            .from("leads")
            .select("estimated_value")
            .eq("company_id", companyId)
            .eq("stage_id", stage.id)
            .is("deleted_at", null);
          if (count === null) throw new Error("Failed to count leads");
          const totalValue = (data ?? []).reduce((sum, row) => sum + Number(row.estimated_value ?? 0), 0);
          return {
            stageId: stage.id,
            stageName: stage.name,
            lifecycleStatus: stage.lifecycleStatus,
            leadCount: count ?? 0,
            totalValue,
          };
        }),
      );
      return { pipelineId, pipelineName: pipeline.name, stages: stageMetrics };
    },
  };
}
