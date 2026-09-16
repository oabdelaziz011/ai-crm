import { useQuery } from "@tanstack/react-query";
import type { AssignmentAuditResourceType } from "@workspace/assignment-audit";
import { supabase } from "@/lib/supabase";
import { listAssignmentHistory } from "@/lib/assignment-audit/assignment-history";

export const assignmentHistoryQueryKey = {
  list: (
    companyId: string | null | undefined,
    resourceType: AssignmentAuditResourceType,
    resourceId: string | null | undefined,
    limit?: number,
    offset?: number,
  ) => ["assignment-history", companyId, resourceType, resourceId, limit, offset] as const,
};

export function useAssignmentHistory(input: {
  companyId: string | null | undefined;
  resourceType: AssignmentAuditResourceType;
  resourceId: string | null | undefined;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: assignmentHistoryQueryKey.list(
      input.companyId,
      input.resourceType,
      input.resourceId,
      input.limit,
      input.offset,
    ),
    enabled: Boolean(input.enabled ?? (input.companyId && input.resourceId)),
    staleTime: 0,
    queryFn: async () => {
      if (!input.companyId || !input.resourceId) return [];
      return listAssignmentHistory(supabase, {
        companyId: input.companyId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        limit: input.limit,
        offset: input.offset,
      });
    },
  });
}
