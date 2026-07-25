import type { SupabaseClient } from "@supabase/supabase-js";
import type { AutomationFlowRecord } from "../types.js";
import type { AutomationFlowVersionRecord, WorkflowGraphSnapshot } from "./types.js";
import type {
  AtomicPublishWorkflowInput,
  AtomicPublishWorkflowResult,
  WorkflowPublishTransactionRepository,
} from "./publish-transaction-repository.js";

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

export function createSupabaseWorkflowPublishTransactionRepository(
  client: SupabaseClient,
): WorkflowPublishTransactionRepository {
  return {
    async publishAtomically(input) {
      const { data, error } = await client.rpc("publish_automation_workflow_version", {
        p_flow_id: input.flowId,
        p_company_id: input.companyId,
        p_release_notes: input.releaseNotes ?? "",
        p_snapshot: input.snapshot,
        p_published_by: input.publishedBy ?? null,
        p_flow_name: input.snapshot.name,
        p_flow_description: input.snapshot.description,
        p_flow_trigger_type: input.snapshot.triggerType,
        p_flow_metadata: input.snapshot.metadata ?? {},
        p_updated_by: input.updatedBy ?? null,
      });

      if (error) throw error;

      const payload = data as { version_id?: string; flow_id?: string } | null;
      const versionId = payload?.version_id;
      if (!versionId) {
        throw new Error("Atomic publish did not return a version id.");
      }

      const [flowResult, versionResult] = await Promise.all([
        client.from("automation_flows").select("*").eq("id", input.flowId).single(),
        client.from("automation_flow_versions").select("*").eq("id", versionId).single(),
      ]);

      if (flowResult.error) throw flowResult.error;
      if (versionResult.error) throw versionResult.error;

      return {
        flow: mapFlow(flowResult.data as Record<string, unknown>),
        version: mapVersion(versionResult.data as Record<string, unknown>),
      } satisfies AtomicPublishWorkflowResult;
    },
  };
}
