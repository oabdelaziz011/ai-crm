import type { SupabaseClient } from "@supabase/supabase-js";
import { AssignmentAuditCompanyScopeError, AssignmentAuditError } from "./errors.js";
import type {
  AssignmentAuditDataPort,
  AssignmentAuditEvent,
  AssignmentAuditResourceType,
  AssignmentAuditSource,
  AssignmentAuditAction,
} from "./types.js";

const RPC = "record_assignment_audit_event";

function mapRow(row: Record<string, unknown>): AssignmentAuditEvent {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    resourceType: String(row.resource_type) as AssignmentAuditResourceType,
    resourceId: String(row.resource_id),
    previousAssigneeUserId: row.previous_assignee_user_id
      ? String(row.previous_assignee_user_id)
      : null,
    newAssigneeUserId: row.new_assignee_user_id ? String(row.new_assignee_user_id) : null,
    action: String(row.action) as AssignmentAuditAction,
    source: String(row.source) as AssignmentAuditSource,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

/**
 * Persistence port. Writes go through record_assignment_audit_event (SECURITY DEFINER).
 * Direct table INSERT is denied for authenticated clients (Phase 5.1).
 */
export function createSupabaseAssignmentAuditDataPort(
  client: SupabaseClient,
): AssignmentAuditDataPort {
  return {
    async assertCompanyScope(companyId, actorUserId) {
      if (!actorUserId) return;
      const { data, error } = await client
        .from("profiles")
        .select("company_id")
        .eq("id", actorUserId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const actorCompanyId = data?.company_id ? String(data.company_id) : null;
      if (actorCompanyId && actorCompanyId !== companyId) {
        throw new AssignmentAuditCompanyScopeError();
      }
    },

    async insertEvent(input) {
      const { data, error } = await client.rpc(RPC, {
        p_company_id: input.companyId,
        p_resource_type: input.resourceType,
        p_resource_id: input.resourceId,
        p_previous_assignee_user_id: input.previousAssigneeUserId,
        p_new_assignee_user_id: input.newAssigneeUserId,
        p_action: input.action,
        p_source: input.source,
        p_actor_user_id: input.actorUserId,
        p_metadata: input.metadata,
      });
      if (error) {
        throw new AssignmentAuditError(
          "AUDIT_INSERT_FAILED",
          `Assignment audit insert failed: ${error.message}`,
        );
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== "object") {
        throw new AssignmentAuditError(
          "AUDIT_INSERT_FAILED",
          "Assignment audit insert failed: empty RPC response.",
        );
      }
      return mapRow(row as Record<string, unknown>);
    },

    async listEvents(input) {
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      const { data, error } = await client
        .from("assignment_audit_events")
        .select(
          "id, company_id, actor_user_id, resource_type, resource_id, previous_assignee_user_id, new_assignee_user_id, action, source, metadata, created_at",
        )
        .eq("company_id", input.companyId)
        .eq("resource_type", input.resourceType)
        .eq("resource_id", input.resourceId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
    },
  };
}
