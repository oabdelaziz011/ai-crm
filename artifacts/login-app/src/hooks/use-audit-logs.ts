import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { AuditLog } from "@/lib/types";

export const AUDIT_LOGS_KEY = ["audit-logs"] as const;

export function useAuditLogs(enabled = true) {
  return useQuery({
    queryKey: AUDIT_LOGS_KEY,
    enabled,
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, company_id, action, entity, entity_id, ip_address, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw new Error(error.message);

      const baseLogs = (data ?? []) as AuditLog[];
      if (baseLogs.length === 0) return [];

      const userIds = Array.from(new Set(baseLogs.map((entry) => entry.user_id).filter(Boolean))) as string[];
      const companyIds = Array.from(new Set(baseLogs.map((entry) => entry.company_id).filter(Boolean))) as string[];

      const [profilesResult, companiesResult] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        companyIds.length > 0
          ? supabase.from("companies").select("id, name").in("id", companyIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (profilesResult.error) throw new Error(profilesResult.error.message);
      if (companiesResult.error) throw new Error(companiesResult.error.message);

      const profileMap = new Map(
        ((profilesResult.data ?? []) as Array<{ id: string; full_name: string | null }>).map((entry) => [
          entry.id,
          { id: entry.id, full_name: entry.full_name },
        ]),
      );

      const companyMap = new Map(
        ((companiesResult.data ?? []) as Array<{ id: string; name: string }>).map((entry) => [
          entry.id,
          { id: entry.id, name: entry.name },
        ]),
      );

      return baseLogs.map((entry) => ({
        ...entry,
        profile: entry.user_id ? (profileMap.get(entry.user_id) ?? null) : null,
        company: entry.company_id ? (companyMap.get(entry.company_id) ?? null) : null,
      }));
    },
  });
}
