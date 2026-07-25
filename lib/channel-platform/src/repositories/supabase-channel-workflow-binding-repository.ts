import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelWorkflowBindingRecord,
  ChannelWorkflowBindingRepository,
} from "./channel-workflow-binding-repository.js";

function mapRow(row: Record<string, unknown>): ChannelWorkflowBindingRecord {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    company_channel_id: row.company_channel_id as string,
    automation_flow_id: row.automation_flow_id as string,
    is_enabled: Boolean(row.is_enabled),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

export function createSupabaseChannelWorkflowBindingRepository(
  client: SupabaseClient,
): ChannelWorkflowBindingRepository {
  return {
    async findByCompanyChannelId(companyChannelId) {
      const { data, error } = await client
        .from("company_channel_automation_bindings")
        .select("*")
        .eq("company_channel_id", companyChannelId)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) throw error;
      return data ? mapRow(data as Record<string, unknown>) : null;
    },
  };
}
