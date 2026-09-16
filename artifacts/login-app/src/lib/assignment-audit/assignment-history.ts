import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AssignmentAuditService,
  createSupabaseAssignmentAuditDataPort,
  type AssignmentAuditEvent,
  type AssignmentAuditResourceType,
} from "@workspace/assignment-audit";

export type ListAssignmentHistoryInput = {
  companyId: string;
  resourceType: AssignmentAuditResourceType;
  resourceId: string;
  limit?: number;
  offset?: number;
};

export async function listAssignmentHistory(
  client: SupabaseClient,
  input: ListAssignmentHistoryInput,
): Promise<AssignmentAuditEvent[]> {
  const scopedCompany = input.companyId.trim();
  const scopedResourceId = input.resourceId.trim();
  if (!scopedCompany || !scopedResourceId) return [];

  const service = new AssignmentAuditService({
    port: createSupabaseAssignmentAuditDataPort(client),
  });

  return service.getAssignmentHistory({
    companyId: scopedCompany,
    resourceType: input.resourceType,
    resourceId: scopedResourceId,
    limit: input.limit,
    offset: input.offset,
  });
}
