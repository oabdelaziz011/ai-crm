import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationFlowVersionRecord,
  CreateAutomationFlowVersionInput,
  WorkflowGraphSnapshot,
} from "./types.js";
import type { AutomationFlowVersionRepository } from "./version-repository.js";

const TABLE = "automation_flow_versions";

function mapVersion(row: Record<string, unknown>): AutomationFlowVersionRecord {
  return {
    id: row.id as string,
    flow_id: row.flow_id as string,
    company_id: row.company_id as string,
    version_number: Number(row.version_number),
    status: row.status as AutomationFlowVersionRecord["status"],
    release_notes: (row.release_notes as string) ?? "",
    snapshot: row.snapshot as WorkflowGraphSnapshot,
    is_active: Boolean(row.is_active),
    is_immutable: Boolean(row.is_immutable ?? true),
    published_at: (row.published_at as string | null) ?? null,
    published_by: (row.published_by as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

export function createSupabaseAutomationFlowVersionRepository(client: SupabaseClient): AutomationFlowVersionRepository {
  return {
    async create(input) {
      const { data, error } = await client
        .from(TABLE)
        .insert({
          flow_id: input.flowId,
          company_id: input.companyId,
          version_number: input.versionNumber,
          release_notes: input.releaseNotes ?? "",
          snapshot: input.snapshot,
          status: "published",
          is_active: false,
          is_immutable: true,
          published_at: new Date().toISOString(),
          published_by: input.publishedBy ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapVersion(data);
    },
    async findById(id) {
      const { data, error } = await client.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? mapVersion(data) : null;
    },
    async findByFlowAndNumber(flowId, versionNumber) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("flow_id", flowId)
        .eq("version_number", versionNumber)
        .maybeSingle();
      if (error) throw error;
      return data ? mapVersion(data) : null;
    },
    async findActiveByFlowId(flowId) {
      const { data, error } = await client.from(TABLE).select("*").eq("flow_id", flowId).eq("is_active", true).maybeSingle();
      if (error) throw error;
      return data ? mapVersion(data) : null;
    },
    async listByFlowId(flowId) {
      const { data, error } = await client
        .from(TABLE)
        .select("*")
        .eq("flow_id", flowId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapVersion);
    },
    async setActiveVersion(flowId, versionId) {
      const { error: clearError } = await client.from(TABLE).update({ is_active: false }).eq("flow_id", flowId);
      if (clearError) throw clearError;
      const { data, error } = await client
        .from(TABLE)
        .update({ is_active: true, status: "published" })
        .eq("id", versionId)
        .eq("flow_id", flowId)
        .select("*")
        .single();
      if (error) throw error;
      return mapVersion(data);
    },
    async getNextVersionNumber(flowId) {
      const { data, error } = await client
        .from(TABLE)
        .select("version_number")
        .eq("flow_id", flowId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? Number(data.version_number) + 1 : 1;
    },
  };
}
