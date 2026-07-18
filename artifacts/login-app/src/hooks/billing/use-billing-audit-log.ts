import { useQuery } from "@tanstack/react-query";
import { listBillingAuditLogsPagedRpc } from "@/lib/billing/list-billing-audit-rpc";
import type { PagedBillingAuditLogs } from "@/lib/billing/types";

export type { BillingAuditStats, PagedBillingAuditLogs } from "@/lib/billing/types";

export function useBillingAuditLogPaged(
  params: {
    enabled?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
    eventType?: string | null;
    companyId?: string | null;
  } = {},
) {
  const { enabled = true, limit = 20, offset = 0, search = "", eventType = null, companyId = null } = params;

  return useQuery({
    queryKey: ["billing", "audit-log", "paged", limit, offset, search, eventType, companyId],
    enabled,
    queryFn: async (): Promise<PagedBillingAuditLogs> => {
      return listBillingAuditLogsPagedRpc({
        limit,
        offset,
        search,
        eventType,
        companyId,
        forExport: false,
      });
    },
  });
}
