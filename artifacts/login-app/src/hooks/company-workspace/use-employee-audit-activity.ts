import { useQuery } from "@tanstack/react-query";
import { APP_QUERY_STALE_MS } from "@/lib/react-query/create-query-client";
import { supabase } from "@/lib/supabase";

export type EmployeeActivityItem = {
  id: string;
  action: string;
  entity: string;
  createdAt: string;
};

/**
 * Best-effort employee activity from audit_logs.
 * Returns [] when unavailable — UI must hide the section.
 */
export function useEmployeeAuditActivity(
  companyId: string | null,
  employeeId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ["company-employee-activity", companyId, employeeId] as const,
    enabled: Boolean(enabled && companyId && employeeId),
    staleTime: APP_QUERY_STALE_MS,
    queryFn: async (): Promise<EmployeeActivityItem[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, entity, entity_id, user_id, metadata, created_at")
        .eq("company_id", companyId!)
        .or(
          `entity_id.eq.${employeeId},user_id.eq.${employeeId}`,
        )
        .order("created_at", { ascending: false })
        .limit(12);

      if (error) {
        // Table missing / RLS — treat as unavailable.
        return [];
      }

      return (data ?? []).map((row) => ({
        id: String(row.id),
        action: String(row.action ?? ""),
        entity: String(row.entity ?? ""),
        createdAt: String(row.created_at),
      }));
    },
  });
}
