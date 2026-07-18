import { listBillingAuditLogsPagedRpc } from "@/lib/billing/list-billing-audit-rpc";
import { listCompanySubscriptionsPagedRpc } from "@/lib/billing/list-company-subscriptions-rpc";
import type { BillingAuditLog } from "@/lib/billing/types";

const PAGE_SIZE = 100;

export async function fetchBillingAuditLogsForExport(params: {
  search?: string;
  eventType?: string | null;
}): Promise<BillingAuditLog[]> {
  const rows: BillingAuditLog[] = [];
  let offset = 0;

  while (true) {
    const result = await listBillingAuditLogsPagedRpc({
      limit: PAGE_SIZE,
      offset,
      search: params.search,
      eventType: params.eventType,
      forExport: true,
    });

    rows.push(...result.rows);

    if (result.rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function fetchCompanySubscriptionsForExport(params: {
  search?: string;
  status?: string | null;
  billingCycle?: string | null;
  sortBy?: string;
  sortDir?: string;
}) {
  type ExportRow = {
    company?: { name?: string };
    plan?: { display_name?: string; name?: string; price_monthly?: number; price_yearly?: number };
    billing_cycle: string;
    status: string;
    next_renewal_at?: string | null;
    current_period_end?: string | null;
  };

  const rows: ExportRow[] = [];
  let offset = 0;

  while (true) {
    const result = await listCompanySubscriptionsPagedRpc({
      limit: PAGE_SIZE,
      offset,
      search: params.search,
      status: params.status,
      billingCycle: params.billingCycle,
      sortBy: (params.sortBy as "company" | "plan" | "status" | "renewal") ?? "renewal",
      sortDir: (params.sortDir as "asc" | "desc") ?? "desc",
    });

    rows.push(...(result.rows as ExportRow[]));

    if (result.rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}
