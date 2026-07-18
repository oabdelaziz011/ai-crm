import { supabase } from "@/lib/supabase";

export type PlatformFinancialListType =
  | "payments"
  | "invoices"
  | "receipts"
  | "failures"
  | "renewals"
  | "expirations";

export type PagedPlatformFinancialResult = {
  schema_version: number;
  total: number;
  limit: number;
  offset: number;
  rows: Record<string, unknown>[];
};

export async function fetchPlatformFinancialListPaged(params: {
  listType: PlatformFinancialListType;
  limit: number;
  offset: number;
  search?: string;
  status?: string | null;
}): Promise<PagedPlatformFinancialResult> {
  const { listType, limit, offset, search = "", status = null } = params;

  switch (listType) {
    case "payments": {
      const { data, error } = await supabase.rpc("list_billing_payments_paged_v1", {
        p_limit: limit,
        p_offset: offset,
        p_search: search.trim() || null,
        p_status: status && status !== "all" ? status : null,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    case "invoices": {
      const { data, error } = await supabase.rpc("list_billing_invoices_paged_v1", {
        p_limit: limit,
        p_offset: offset,
        p_search: search.trim() || null,
        p_status: status && status !== "all" ? status : null,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    case "receipts": {
      const { data, error } = await supabase.rpc("list_billing_receipts_paged_v1", {
        p_limit: limit,
        p_offset: offset,
        p_search: search.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    case "failures": {
      const { data, error } = await supabase.rpc("list_billing_payment_failures_paged_v1", {
        p_limit: limit,
        p_offset: offset,
        p_search: search.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    case "renewals": {
      const { data, error } = await supabase.rpc("list_upcoming_renewals_paged_v1", {
        p_limit: limit,
        p_offset: offset,
        p_days: 30,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    case "expirations": {
      const { data, error } = await supabase.rpc("list_expiring_subscriptions_paged_v1", {
        p_limit: limit,
        p_offset: offset,
      });
      if (error) throw new Error(error.message);
      return data as PagedPlatformFinancialResult;
    }
    default:
      throw new Error(`Unsupported list type: ${listType satisfies never}`);
  }
}

export async function fetchBillingRevenueMetricsV1() {
  const { data, error } = await supabase.rpc("get_billing_revenue_metrics_v1");
  if (error) throw new Error(error.message);
  return data as {
    schema_version: number;
    mrr: number;
    arr: number;
    active_subscriptions: number;
    trialing_subscriptions: number;
    failed_payments_30d: number;
    failed_payment_rate: number;
  };
}

export async function fetchPaymentProviderHealthV1() {
  const { data, error } = await supabase.rpc("get_payment_provider_health_v1");
  if (error) throw new Error(error.message);
  return data as {
    schema_version: number;
    payment_sandbox_mode?: boolean;
    active_mode?: "sandbox" | "production";
    active_provider_code?: string;
    providers: Array<{
      provider_code: string;
      display_name: string;
      status: string;
      latency_ms: number | null;
      success_rate: number | null;
      error_rate: number | null;
      checked_at: string;
      is_active_route?: boolean;
    }>;
  };
}
