import { supabase } from "@/lib/supabase";
import type { BillingAuditLog, PagedBillingAuditLogs } from "@/lib/billing/types";

export type ListBillingAuditLogsParams = {
  limit: number;
  offset: number;
  search?: string;
  eventType?: string | null;
  forExport?: boolean;
  companyId?: string | null;
};

export type ListBillingAuditLogsResult = PagedBillingAuditLogs;

function normalizePayload(payload: PagedBillingAuditLogs, limit: number, offset: number): ListBillingAuditLogsResult {
  return {
    total: Number(payload.total ?? 0),
    limit: Number(payload.limit ?? limit),
    offset: Number(payload.offset ?? offset),
    rows: (payload.rows ?? []) as PagedBillingAuditLogs["rows"],
    stats: payload.stats ?? {
      total: Number(payload.total ?? 0),
      manual: 0,
      system: 0,
      api: 0,
    },
  };
}

function isMissingAuditRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    lower.includes("unknown argument") ||
    lower.includes("p_company_id") ||
    lower.includes("does not exist")
  );
}

export async function listBillingAuditLogsPagedRpc(
  params: ListBillingAuditLogsParams,
): Promise<ListBillingAuditLogsResult> {
  const { limit, offset, search = "", eventType = null, forExport = false, companyId = null } = params;

  const { data, error } = await supabase.rpc("list_billing_audit_logs_paged", {
    p_limit: limit,
    p_offset: offset,
    p_search: search.trim() || null,
    p_event_type: eventType && eventType !== "all" ? eventType : null,
    p_for_export: forExport,
    p_company_id: companyId,
  });

  if (!error) {
    return normalizePayload(data as PagedBillingAuditLogs, limit, offset);
  }

  if (isMissingAuditRpcError(error.message)) {
    throw new Error(
      "Billing migration 105 is not applied. Audit queries require list_billing_audit_logs_paged with p_company_id.",
    );
  }

  throw new Error(error.message);
}

export type { BillingAuditLog };
