import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OpportunityHistoryRecord,
  OpportunityPipelineRecord,
  OpportunityRecord,
  OpportunityStageKey,
  OpportunityStageRecord,
} from "../types.js";
import type {
  CreateOpportunityInput,
  OpportunityRepository,
  UpdateOpportunityInput,
} from "./opportunity-repository-port.js";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapStage(row: Record<string, unknown>): OpportunityStageRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    pipelineId: String(row.pipeline_id),
    name: String(row.name),
    slug: String(row.slug),
    stageKey: String(row.stage_key) as OpportunityStageKey,
    sortOrder: Number(row.sort_order ?? 0),
    defaultProbabilityPercent: Number(row.default_probability_percent ?? 0),
    isTerminal: Boolean(row.is_terminal),
  };
}

function mapPipeline(row: Record<string, unknown>): OpportunityPipelineRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    name: String(row.name),
    slug: String(row.slug),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  };
}

function mapOpportunity(row: Record<string, unknown>): OpportunityRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    pipelineId: String(row.pipeline_id),
    stageId: String(row.stage_id),
    name: String(row.name),
    leadId: row.lead_id ? String(row.lead_id) : null,
    customerId: row.customer_id ? String(row.customer_id) : null,
    primaryContactName: String(row.primary_contact_name ?? ""),
    ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    companyName: row.company_name != null ? String(row.company_name) : null,
    country: row.country != null ? String(row.country) : null,
    market: row.market != null ? String(row.market) : null,
    language: row.language != null ? String(row.language) : null,
    currency: String(row.currency ?? "USD"),
    expectedRevenue: num(row.expected_revenue),
    weightedRevenue: num(row.weighted_revenue),
    exchangeRate: num(row.exchange_rate),
    regionalPricing: (row.regional_pricing as Record<string, unknown>) ?? {},
    probabilityPercent: Number(row.probability_percent ?? 0),
    probabilityConfidence: num(row.probability_confidence),
    probabilitySource: String(row.probability_source ?? "manual"),
    probabilityReason: String(row.probability_reason ?? ""),
    expectedCloseDate: row.expected_close_date != null ? String(row.expected_close_date) : null,
    createdFromLead: Boolean(row.created_from_lead),
    aiScoreSnapshot: num(row.ai_score_snapshot),
    aiContextSnapshot: (row.ai_context_snapshot as Record<string, unknown>) ?? {},
    currentQuoteId: row.current_quote_id ? String(row.current_quote_id) : null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    wonAt: row.won_at != null ? String(row.won_at) : null,
    lostAt: row.lost_at != null ? String(row.lost_at) : null,
    lostReason: row.lost_reason != null ? String(row.lost_reason) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHistory(row: Record<string, unknown>): OpportunityHistoryRecord {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    opportunityId: String(row.opportunity_id),
    eventType: String(row.event_type),
    fieldName: row.field_name != null ? String(row.field_name) : null,
    previousValue: row.previous_value != null ? String(row.previous_value) : null,
    newValue: row.new_value != null ? String(row.new_value) : null,
    summary: String(row.summary ?? ""),
    payload: (row.payload as Record<string, unknown>) ?? {},
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    createdAt: String(row.created_at),
  };
}

export function createSupabaseOpportunityRepository(client: SupabaseClient): OpportunityRepository {
  return {
    async ensureDefaultPipeline(companyId) {
      const { data, error } = await client.rpc("opportunity_platform_ensure_default_pipeline", {
        p_company_id: companyId,
      });
      if (error) throw error;
      return String(data);
    },

    async getDefaultStage(companyId, pipelineId) {
      const { data, error } = await client
        .from("opportunity_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_id", pipelineId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStage(data as Record<string, unknown>) : null;
    },

    async getStage(companyId, stageId) {
      const { data, error } = await client
        .from("opportunity_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", stageId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStage(data as Record<string, unknown>) : null;
    },

    async listPipelines(companyId) {
      const { data, error } = await client
        .from("opportunity_pipelines")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapPipeline(row as Record<string, unknown>));
    },

    async listStages(companyId, pipelineId) {
      const { data, error } = await client
        .from("opportunity_stages")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_id", pipelineId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => mapStage(row as Record<string, unknown>));
    },

    async createOpportunity(input) {
      const { data, error } = await client
        .from("opportunities")
        .insert({
          company_id: input.companyId,
          pipeline_id: input.pipelineId,
          stage_id: input.stageId,
          name: input.name,
          lead_id: input.leadId ?? null,
          customer_id: input.customerId ?? null,
          primary_contact_name: input.primaryContactName ?? "",
          owner_user_id: input.ownerUserId ?? null,
          company_name: input.companyName ?? null,
          country: input.country ?? null,
          market: input.market ?? null,
          language: input.language ?? null,
          currency: input.currency ?? "USD",
          expected_revenue: input.expectedRevenue ?? null,
          weighted_revenue: input.weightedRevenue ?? null,
          exchange_rate: input.exchangeRate ?? null,
          regional_pricing: input.regionalPricing ?? {},
          probability_percent: input.probabilityPercent,
          probability_confidence: input.probabilityConfidence ?? null,
          probability_source: input.probabilitySource ?? "manual",
          probability_reason: input.probabilityReason ?? "",
          expected_close_date: input.expectedCloseDate ?? null,
          created_from_lead: input.createdFromLead ?? false,
          ai_score_snapshot: input.aiScoreSnapshot ?? null,
          ai_context_snapshot: input.aiContextSnapshot ?? {},
          metadata: input.metadata ?? {},
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapOpportunity(data as Record<string, unknown>);
    },

    async updateOpportunity(input) {
      const patch: Record<string, unknown> = {
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) patch.name = input.name;
      if (input.stageId !== undefined) patch.stage_id = input.stageId;
      if (input.ownerUserId !== undefined) patch.owner_user_id = input.ownerUserId;
      if (input.companyName !== undefined) patch.company_name = input.companyName;
      if (input.primaryContactName !== undefined) patch.primary_contact_name = input.primaryContactName;
      if (input.country !== undefined) patch.country = input.country;
      if (input.market !== undefined) patch.market = input.market;
      if (input.language !== undefined) patch.language = input.language;
      if (input.currency !== undefined) patch.currency = input.currency;
      if (input.expectedRevenue !== undefined) patch.expected_revenue = input.expectedRevenue;
      if (input.weightedRevenue !== undefined) patch.weighted_revenue = input.weightedRevenue;
      if (input.exchangeRate !== undefined) patch.exchange_rate = input.exchangeRate;
      if (input.probabilityPercent !== undefined) patch.probability_percent = input.probabilityPercent;
      if (input.probabilityConfidence !== undefined) patch.probability_confidence = input.probabilityConfidence;
      if (input.probabilitySource !== undefined) patch.probability_source = input.probabilitySource;
      if (input.probabilityReason !== undefined) patch.probability_reason = input.probabilityReason;
      if (input.expectedCloseDate !== undefined) patch.expected_close_date = input.expectedCloseDate;
      if (input.customerId !== undefined) patch.customer_id = input.customerId;
      if (input.wonAt !== undefined) patch.won_at = input.wonAt;
      if (input.lostAt !== undefined) patch.lost_at = input.lostAt;
      if (input.lostReason !== undefined) patch.lost_reason = input.lostReason;
      if (input.metadata !== undefined) patch.metadata = input.metadata;

      const { data, error } = await client
        .from("opportunities")
        .update(patch)
        .eq("company_id", input.companyId)
        .eq("id", input.opportunityId)
        .is("deleted_at", null)
        .select("*")
        .single();
      if (error) throw error;
      return mapOpportunity(data as Record<string, unknown>);
    },

    async softDeleteOpportunity(companyId, opportunityId, updatedBy) {
      const { error } = await client
        .from("opportunities")
        .update({
          deleted_at: new Date().toISOString(),
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", opportunityId);
      if (error) throw error;
    },

    async getOpportunity(companyId, opportunityId) {
      const { data, error } = await client
        .from("opportunities")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", opportunityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ? mapOpportunity(data as Record<string, unknown>) : null;
    },

    async listOpportunities(input) {
      let query = client
        .from("opportunities")
        .select("*", { count: "exact" })
        .eq("company_id", input.companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.pipelineId) query = query.eq("pipeline_id", input.pipelineId);
      if (input.stageId) query = query.eq("stage_id", input.stageId);
      if (input.ownerUserId) query = query.eq("owner_user_id", input.ownerUserId);
      if (input.leadId) query = query.eq("lead_id", input.leadId);
      if (input.query?.trim()) {
        const q = `%${input.query.trim()}%`;
        query = query.or(`name.ilike.${q},company_name.ilike.${q},primary_contact_name.ilike.${q}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []).map((row) => mapOpportunity(row as Record<string, unknown>)),
        total: count ?? 0,
      };
    },

    async addHistory(input) {
      const { data, error } = await client
        .from("opportunity_history")
        .insert({
          company_id: input.companyId,
          opportunity_id: input.opportunityId,
          event_type: input.eventType,
          field_name: input.fieldName ?? null,
          previous_value: input.previousValue ?? null,
          new_value: input.newValue ?? null,
          summary: input.summary ?? "",
          payload: input.payload ?? {},
          actor_user_id: input.actorUserId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapHistory(data as Record<string, unknown>);
    },

    async listHistory(companyId, opportunityId, limit = 100) {
      const { data, error } = await client
        .from("opportunity_history")
        .select("*")
        .eq("company_id", companyId)
        .eq("opportunity_id", opportunityId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => mapHistory(row as Record<string, unknown>));
    },

    async getLeadSnapshot(companyId, leadId) {
      const { data, error } = await client
        .from("leads")
        .select(
          "id, title, contact_name, company_name, customer_id, assigned_user_id, estimated_value, currency, expected_close_date, language, territory, is_qualified, score, ai_summary, metadata",
        )
        .eq("company_id", companyId)
        .eq("id", leadId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: String(data.id),
        title: String(data.title),
        contactName: String(data.contact_name ?? ""),
        companyName: data.company_name != null ? String(data.company_name) : null,
        customerId: data.customer_id ? String(data.customer_id) : null,
        assignedUserId: data.assigned_user_id ? String(data.assigned_user_id) : null,
        estimatedValue: num(data.estimated_value),
        currency: String(data.currency ?? "USD"),
        expectedCloseDate: data.expected_close_date != null ? String(data.expected_close_date) : null,
        language: data.language != null ? String(data.language) : null,
        territory: data.territory != null ? String(data.territory) : null,
        isQualified: Boolean(data.is_qualified),
        score: Number(data.score ?? 0),
        aiSummary: String(data.ai_summary ?? ""),
        metadata: (data.metadata as Record<string, unknown>) ?? {},
      };
    },
  };
}
